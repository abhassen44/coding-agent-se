"""Repository API endpoints."""
import os
import shutil
import tempfile
from typing import Optional
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, status, Query, BackgroundTasks
from sqlalchemy import select, func

from app.api.deps import DbSession, CurrentUser
from app.models.file import Repository, File
from app.services.file_service import FileService
from app.services.rag_service import RAGService
from app.schemas.file import (
    RepositoryCreate,
    RepositoryImport,
    RepositoryResponse,
    RepositoryListResponse,
    SearchQuery,
    SearchResult,
    ContextRequest,
    ContextResponse,
    ChunkResponse,
    FileListResponse,
    FileResponse,
)

router = APIRouter(prefix="/repo", tags=["repository"])


async def _count_repo_files(db, repo_id: int) -> int:
    """Count files in a repository."""
    result = await db.execute(
        select(func.count(File.id)).where(File.repository_id == repo_id)
    )
    return result.scalar_one()


@router.post("", response_model=RepositoryResponse)
async def create_repository(
    repo: RepositoryCreate,
    db: DbSession,
    current_user: CurrentUser
):
    """Create a new repository."""
    new_repo = Repository(
        name=repo.name,
        url=repo.url,
        description=repo.description,
        owner_id=current_user.id
    )
    
    db.add(new_repo)
    await db.commit()
    await db.refresh(new_repo)
    
    response = RepositoryResponse.model_validate(new_repo)
    response.file_count = 0
    return response


@router.post("/import", response_model=RepositoryResponse)
async def import_github_repository(
    repo_import: RepositoryImport,
    background_tasks: BackgroundTasks,
    db: DbSession,
    current_user: CurrentUser
):
    """Import a GitHub repository by cloning and indexing files."""
    import subprocess
    
    # Extract repo name from URL
    url_parts = repo_import.url.rstrip('/').split('/')
    repo_name = url_parts[-1].replace('.git', '')
    
    # Create repository record
    new_repo = Repository(
        name=repo_name,
        url=repo_import.url,
        description=f"Imported from {repo_import.url}",
        owner_id=current_user.id
    )
    
    db.add(new_repo)
    await db.commit()
    await db.refresh(new_repo)
    
    # Clone and index in background
    async def clone_and_index(repo_id: int, url: str, branch: str, owner_id: int):
        from app.core.database import async_session_maker
        
        clone_dir = Path(tempfile.mkdtemp())
        try:
            # Clone repository
            subprocess.run(
                ["git", "clone", "--depth", "1", "--branch", branch, url, str(clone_dir)],
                check=True,
                capture_output=True,
                timeout=120
            )
            
            async with async_session_maker() as session:
                file_service = FileService(session)
                rag_service = RAGService(session)
                
                # Walk directory and upload files
                code_extensions = {'.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.cpp', '.c', '.h', 
                                   '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.cs',
                                   '.html', '.css', '.json', '.yaml', '.yml', '.md', '.sql', '.sh'}
                
                for file_path in clone_dir.rglob('*'):
                    if file_path.is_file() and file_path.suffix.lower() in code_extensions:
                        # Skip hidden files and common ignore patterns
                        if any(part.startswith('.') for part in file_path.parts):
                            continue
                        if any(part in ['node_modules', 'venv', '__pycache__', 'dist', 'build'] for part in file_path.parts):
                            continue
                        
                        try:
                            content = file_path.read_bytes()
                            if len(content) > 1024 * 1024:  # Skip files > 1MB
                                continue
                            
                            relative_path = str(file_path.relative_to(clone_dir))
                            stored_file = await file_service.upload_file(
                                file_content=content,
                                filename=file_path.name,
                                owner_id=owner_id,
                                repository_id=repo_id,
                                original_path=relative_path
                            )
                            
                            # Index for RAG
                            if stored_file.language:
                                try:
                                    await rag_service.index_file(
                                        stored_file, 
                                        content.decode('utf-8', errors='ignore')
                                    )
                                except Exception:
                                    pass
                        except Exception as e:
                            print(f"Failed to process {file_path}: {e}")
                
                # Update indexed timestamp
                result = await session.execute(
                    select(Repository).where(Repository.id == repo_id)
                )
                repo = result.scalar_one_or_none()
                if repo:
                    repo.indexed_at = datetime.now()
                    await session.commit()
                    
        except subprocess.TimeoutExpired:
            print(f"Clone timeout for {url}")
        except Exception as e:
            print(f"Import failed: {e}")
        finally:
            shutil.rmtree(clone_dir, ignore_errors=True)
    
    # Start background task
    background_tasks.add_task(
        clone_and_index,
        new_repo.id,
        repo_import.url,
        repo_import.branch,
        current_user.id
    )
    
    response = RepositoryResponse.model_validate(new_repo)
    response.file_count = 0
    return response


@router.get("", response_model=RepositoryListResponse)
async def list_repositories(
    db: DbSession,
    current_user: CurrentUser,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50)
):
    """List repositories owned by the current user."""
    query = select(Repository).where(Repository.owner_id == current_user.id)
    query = query.order_by(Repository.created_at.desc()).offset(offset).limit(limit)
    
    count_query = select(func.count(Repository.id)).where(Repository.owner_id == current_user.id)
    
    result = await db.execute(query)
    count_result = await db.execute(count_query)
    
    repos = list(result.scalars().all())
    total = count_result.scalar_one()
    
    # Get file counts
    responses = []
    for repo in repos:
        response = RepositoryResponse.model_validate(repo)
        response.file_count = await _count_repo_files(db, repo.id)
        responses.append(response)
    
    return RepositoryListResponse(repositories=responses, total=total)


@router.get("/{repo_id}", response_model=RepositoryResponse)
async def get_repository(
    repo_id: int,
    db: DbSession,
    current_user: CurrentUser
):
    """Get repository by ID."""
    result = await db.execute(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.owner_id == current_user.id
        )
    )
    repo = result.scalar_one_or_none()
    
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    response = RepositoryResponse.model_validate(repo)
    response.file_count = await _count_repo_files(db, repo.id)
    return response


@router.get("/{repo_id}/files", response_model=FileListResponse)
async def list_repository_files(
    repo_id: int,
    db: DbSession,
    current_user: CurrentUser,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100)
):
    """List files in a repository."""
    # Verify repo ownership
    result = await db.execute(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.owner_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    file_service = FileService(db)
    files, total = await file_service.list_files(
        owner_id=current_user.id,
        repository_id=repo_id,
        offset=offset,
        limit=limit
    )
    
    return FileListResponse(
        files=[FileResponse.model_validate(f) for f in files],
        total=total
    )


@router.post("/{repo_id}/search", response_model=SearchResult)
async def search_repository(
    repo_id: int,
    search: SearchQuery,
    db: DbSession,
    current_user: CurrentUser
):
    """Perform semantic search within a repository."""
    # Verify repo ownership
    result = await db.execute(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.owner_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    rag_service = RAGService(db)
    chunks_with_scores = await rag_service.search(
        query=search.query,
        top_k=search.top_k,
        repository_id=repo_id,
        owner_id=current_user.id
    )
    
    chunk_responses = [
        ChunkResponse(
            id=cws.chunk.id,
            file_id=cws.chunk.file_id,
            content=cws.chunk.content,
            start_line=cws.chunk.start_line,
            end_line=cws.chunk.end_line,
            file_path=cws.file_path,
            file_name=cws.file_name,
            relevance_score=cws.score
        )
        for cws in chunks_with_scores
    ]
    
    return SearchResult(
        chunks=chunk_responses,
        query=search.query,
        total_results=len(chunk_responses)
    )


@router.post("/{repo_id}/context", response_model=ContextResponse)
async def get_repository_context(
    repo_id: int,
    request: ContextRequest,
    db: DbSession,
    current_user: CurrentUser
):
    """Get RAG context for chat from repository."""
    # Verify repo ownership
    result = await db.execute(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.owner_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    rag_service = RAGService(db)
    context = await rag_service.get_context_for_chat(
        query=request.query,
        repository_id=repo_id,
        max_chunks=request.max_chunks,
        owner_id=current_user.id
    )
    
    return context


@router.delete("/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository(
    repo_id: int,
    db: DbSession,
    current_user: CurrentUser
):
    """Delete a repository and all its files."""
    result = await db.execute(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.owner_id == current_user.id
        )
    )
    repo = result.scalar_one_or_none()
    
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    # Delete repository (cascades to files and chunks)
    await db.delete(repo)
    await db.commit()
