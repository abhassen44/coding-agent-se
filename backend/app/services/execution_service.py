"""Sandboxed code execution service using Docker containers."""
import os
import time
import tempfile
import asyncio
from datetime import datetime
from typing import Optional
from pathlib import Path

import docker
from docker.errors import ContainerError, ImageNotFound, APIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.models.execution import Execution
from app.core.config import get_settings

settings = get_settings()

# Language → Docker image mapping
LANGUAGE_IMAGES = {
    "python": "python:3.12-slim",
    "javascript": "node:20-slim",
    "cpp": "gcc:14",
    "java": "eclipse-temurin:21",
}

# Language → file extension mapping
LANGUAGE_EXTENSIONS = {
    "python": ".py",
    "javascript": ".js",
    "cpp": ".cpp",
    "java": ".java",
}

# Language → run command templates
# {file} will be replaced with the actual filename inside container
LANGUAGE_COMMANDS = {
    "python": "python /code/main.py",
    "javascript": "node /code/main.js",
    "cpp": "bash -c 'g++ -o /tmp/a.out /code/main.cpp && /tmp/a.out'",
    "java": "bash -c 'cd /code && javac Main.java && java Main'",
}


class ExecutionService:
    """Service for executing code in Docker sandboxes."""

    def __init__(self, db: AsyncSession):
        self.db = db
        try:
            self.docker_client = docker.from_env()
        except Exception as e:
            print(f"Warning: Docker client not available: {e}")
            self.docker_client = None

    def _get_supported_languages(self) -> list[str]:
        """Return list of supported languages."""
        return list(LANGUAGE_IMAGES.keys())

    async def execute_code(
        self,
        user_id: int,
        code: str,
        language: str,
        stdin: Optional[str] = None,
        timeout: int = 10,
    ) -> Execution:
        """Execute code in a sandboxed Docker container."""
        language = language.lower().strip()

        # Validate language
        if language not in LANGUAGE_IMAGES:
            execution = Execution(
                user_id=user_id,
                language=language,
                code=code,
                stdin=stdin,
                status="error",
                stderr=f"Unsupported language: {language}. Supported: {', '.join(LANGUAGE_IMAGES.keys())}",
                exit_code=-1,
                execution_time_ms=0,
                completed_at=datetime.utcnow(),
            )
            self.db.add(execution)
            await self.db.commit()
            await self.db.refresh(execution)
            return execution

        # Check Docker availability
        if self.docker_client is None:
            execution = Execution(
                user_id=user_id,
                language=language,
                code=code,
                stdin=stdin,
                status="error",
                stderr="Docker is not available. Please ensure Docker Desktop is running.",
                exit_code=-1,
                execution_time_ms=0,
                completed_at=datetime.utcnow(),
            )
            self.db.add(execution)
            await self.db.commit()
            await self.db.refresh(execution)
            return execution

        # Create execution record
        execution = Execution(
            user_id=user_id,
            language=language,
            code=code,
            stdin=stdin,
            status="running",
        )
        self.db.add(execution)
        await self.db.commit()
        await self.db.refresh(execution)

        # Run in thread pool to avoid blocking async event loop
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            self._run_in_container,
            code,
            language,
            stdin,
            timeout,
        )

        # Update execution record
        execution.stdout = result["stdout"]
        execution.stderr = result["stderr"]
        execution.status = result["status"]
        execution.exit_code = result["exit_code"]
        execution.execution_time_ms = result["execution_time_ms"]
        execution.completed_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(execution)
        return execution

    def _run_in_container(
        self,
        code: str,
        language: str,
        stdin: Optional[str],
        timeout: int,
    ) -> dict:
        """Run code inside a Docker container (blocking, runs in thread pool)."""
        image = LANGUAGE_IMAGES[language]
        ext = LANGUAGE_EXTENSIONS[language]
        cmd = LANGUAGE_COMMANDS[language]

        # For Java, the file must be named Main.java
        filename = "Main.java" if language == "java" else f"main{ext}"

        # Create temp directory with the code file
        tmp_dir = tempfile.mkdtemp(prefix="ica_exec_")
        code_file = os.path.join(tmp_dir, filename)
        with open(code_file, "w", encoding="utf-8") as f:
            f.write(code)

        # Write stdin to file if provided
        stdin_file = None
        if stdin:
            stdin_file = os.path.join(tmp_dir, "stdin.txt")
            with open(stdin_file, "w", encoding="utf-8") as f:
                f.write(stdin)
            # Modify command to pipe stdin
            cmd = f"bash -c '{cmd} < /code/stdin.txt'"

        start_time = time.time()

        try:
            # Ensure image is available
            try:
                self.docker_client.images.get(image)
            except ImageNotFound:
                print(f"Pulling image {image}...")
                self.docker_client.images.pull(image)

            # Run container with security constraints
            container = self.docker_client.containers.run(
                image=image,
                command=cmd,
                volumes={
                    tmp_dir: {"bind": "/code", "mode": "ro"},
                },
                tmpfs={"/tmp": "size=64M"},
                network_disabled=True,
                mem_limit=settings.execution_memory_limit,
                cpu_period=100000,
                cpu_quota=settings.execution_cpu_quota,
                detach=True,
                stderr=True,
                stdout=True,
            )

            try:
                # Wait for container to finish with timeout
                result = container.wait(timeout=timeout)
                exit_code = result.get("StatusCode", -1)

                stdout = container.logs(stdout=True, stderr=False).decode(
                    "utf-8", errors="replace"
                )
                stderr = container.logs(stdout=False, stderr=True).decode(
                    "utf-8", errors="replace"
                )

                elapsed_ms = int((time.time() - start_time) * 1000)

                status = "success" if exit_code == 0 else "error"

                return {
                    "stdout": stdout[:50000],  # Cap output at 50KB
                    "stderr": stderr[:50000],
                    "status": status,
                    "exit_code": exit_code,
                    "execution_time_ms": elapsed_ms,
                }

            except Exception as wait_error:
                # Timeout or other error — kill container
                try:
                    container.kill()
                except Exception:
                    pass

                elapsed_ms = int((time.time() - start_time) * 1000)

                # Check if it's a timeout
                if "timed out" in str(wait_error).lower() or elapsed_ms >= timeout * 1000:
                    return {
                        "stdout": "",
                        "stderr": f"Execution timed out after {timeout} seconds.",
                        "status": "timeout",
                        "exit_code": -1,
                        "execution_time_ms": elapsed_ms,
                    }

                return {
                    "stdout": "",
                    "stderr": f"Container error: {str(wait_error)}",
                    "status": "error",
                    "exit_code": -1,
                    "execution_time_ms": elapsed_ms,
                }

            finally:
                # Always remove container
                try:
                    container.remove(force=True)
                except Exception:
                    pass

        except ImageNotFound:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"Docker image '{image}' not found and could not be pulled. Check your internet connection.",
                "status": "error",
                "exit_code": -1,
                "execution_time_ms": elapsed_ms,
            }

        except APIError as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"Docker API error: {str(e)}",
                "status": "error",
                "exit_code": -1,
                "execution_time_ms": elapsed_ms,
            }

        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "stdout": "",
                "stderr": f"Execution error: {str(e)}",
                "status": "error",
                "exit_code": -1,
                "execution_time_ms": elapsed_ms,
            }

        finally:
            # Clean up temp directory
            try:
                import shutil
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass

    async def get_execution(self, execution_id: int, user_id: int) -> Optional[Execution]:
        """Get a single execution by ID (owned by user)."""
        result = await self.db.execute(
            select(Execution).where(
                Execution.id == execution_id,
                Execution.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_history(
        self, user_id: int, limit: int = 20, offset: int = 0
    ) -> tuple[list[Execution], int]:
        """Get execution history for a user."""
        # Get total count
        from sqlalchemy import func
        count_result = await self.db.execute(
            select(func.count()).select_from(Execution).where(
                Execution.user_id == user_id
            )
        )
        total = count_result.scalar() or 0

        # Get paginated results
        result = await self.db.execute(
            select(Execution)
            .where(Execution.user_id == user_id)
            .order_by(desc(Execution.created_at))
            .limit(limit)
            .offset(offset)
        )
        executions = list(result.scalars().all())

        return executions, total

    async def save_diagnostic(
        self, execution_id: int, diagnostic: str
    ) -> None:
        """Save AI diagnostic to an execution record."""
        result = await self.db.execute(
            select(Execution).where(Execution.id == execution_id)
        )
        execution = result.scalar_one_or_none()
        if execution:
            execution.error_diagnostic = diagnostic
            await self.db.commit()
