"""File and repository API endpoints."""
import base64
import io
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, status, Query

from app.api.deps import DbSession, CurrentUser
from app.services.file_service import FileService
from app.services.rag_service import RAGService
from app.schemas.file import (
    FileResponse,
    FileUploadResponse,
    FileListResponse,
)

router = APIRouter(prefix="/files", tags=["files"])

# ── Supported types ─────────────────────────────────────────────────────────
PDF_TYPES = {"application/pdf", "pdf"}
WORD_TYPES = {"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "application/msword", "word", "docx", "doc"}
IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
               "image/bmp", "image/svg+xml", "png", "jpg", "jpeg", "gif", "webp", "bmp"}
TEXT_TYPES = {"text/plain", "text/markdown", "text/csv", "text", "markdown", "txt", "csv",
              "python", "javascript", "typescript", "java", "go", "rust", "cpp", "c",
              "html", "css", "json", "yaml", "sql", "bash", "powershell"}

MAX_EXTRACT_SIZE = 20 * 1024 * 1024  # 20MB



@router.post("/extract-text")
async def extract_text(
    current_user: CurrentUser,
    file: UploadFile = File(...),
):
    """
    Extract readable text from an uploaded file for use as inline chat context.
    Supports: PDF, Word (.docx/.doc), images (Gemini Vision), and plain text/code.
    Does NOT save to DB — purely for the current chat session.
    """
    content = await file.read()
    filename = file.filename or "unnamed"
    mime = (file.content_type or "").lower()
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if len(content) > MAX_EXTRACT_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20MB for extraction)")

    extracted = ""
    file_type = "unknown"

    # ── PDF ─────────────────────────────────────────────────────────
    if mime in PDF_TYPES or ext == "pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            pages = []
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                if text.strip():
                    pages.append(f"[Page {i+1}]\n{text}")
            extracted = "\n\n".join(pages)
            file_type = "pdf"
            if not extracted.strip():
                extracted = "[PDF contains no extractable text — may be scanned/image-based]"
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"PDF extraction failed: {e}")

    # ── Word (.docx) ──────────────────────────────────────────────
    elif mime in WORD_TYPES or ext in {"docx", "doc"}:
        try:
            from docx import Document
            doc = Document(io.BytesIO(content))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            extracted = "\n".join(paragraphs)
            file_type = "word"
            if not extracted.strip():
                extracted = "[Word document contains no extractable text]"
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Word extraction failed: {e}")

    # ── Images — Ollama Vision ────────────────────────────────────
    elif mime in IMAGE_TYPES or ext in {"png", "jpg", "jpeg", "gif", "webp", "bmp"}:
        try:
            import httpx
            import base64
            from app.services.ollama_service import OLLAMA_BASE_URL

            b64_image = base64.b64encode(content).decode("utf-8")
            target_model = "gemma4:31b-cloud"

            # Use Ollama API with images array
            with httpx.Client(timeout=120.0) as client:
                resp = client.post(
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": target_model,
                        "messages": [
                            {
                                "role": "user",
                                "content": "Describe this image in detail. If it contains text, code, diagrams, charts, or tables, transcribe and explain them fully.",
                                "images": [b64_image]
                            }
                        ],
                        "stream": False,
                        "options": {"temperature": 0.1}
                    }
                )
                
                if resp.status_code == 200:
                    data = resp.json()
                    extracted = data.get("message", {}).get("content", "[No description generated]")
                else:
                    extracted = f"[Ollama Error: HTTP {resp.status_code} - {resp.text[:100]}]"

            file_type = "image"
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Image analysis failed: {e}")

    # ── Plain text / code ─────────────────────────────────────────
    elif mime in TEXT_TYPES or ext in {"txt", "md", "py", "js", "ts", "tsx", "jsx",
                                        "java", "go", "rs", "cpp", "c", "cs", "html",
                                        "css", "json", "yaml", "yml", "sql", "sh",
                                        "csv", "xml", "toml", "ini", "env"}:
        try:
            extracted = content.decode("utf-8", errors="replace")
            file_type = "code" if ext not in {"txt", "md", "csv"} else ext
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Text decoding failed: {e}")

    else:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {ext or mime}. Supported: PDF, Word (docx), images (png/jpg/gif/webp), text, code files."
        )

    # Truncate to ~50K chars to avoid token overload
    MAX_CHARS = 50_000
    truncated = False
    if len(extracted) > MAX_CHARS:
        extracted = extracted[:MAX_CHARS]
        truncated = True

    return {
        "filename": filename,
        "file_type": file_type,
        "text": extracted,
        "char_count": len(extracted),
        "truncated": truncated,
    }


@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(
    db: DbSession,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    repository_id: Optional[int] = None
):
    """Upload a file and optionally associate with a repository."""
    # Read file content
    content = await file.read()
    
    # Check file size (max 10MB)
    max_size = 10 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {max_size // (1024*1024)}MB"
        )
    
    file_service = FileService(db)
    
    # Upload file
    stored_file = await file_service.upload_file(
        file_content=content,
        filename=file.filename or "unnamed",
        owner_id=current_user.id,
        repository_id=repository_id,
        original_path=file.filename
    )
    
    # Index for RAG if it's a code file
    if stored_file.language:
        try:
            rag_service = RAGService(db)
            await rag_service.index_file(stored_file, content.decode('utf-8', errors='ignore'))
        except Exception as e:
            # Don't fail upload if indexing fails
            pass
    
    return FileUploadResponse(
        file=FileResponse.model_validate(stored_file),
        message="File uploaded successfully"
    )


@router.get("", response_model=FileListResponse)
async def list_files(
    db: DbSession,
    current_user: CurrentUser,
    repository_id: Optional[int] = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100)
):
    """List files owned by the current user."""
    file_service = FileService(db)
    files, total = await file_service.list_files(
        owner_id=current_user.id,
        repository_id=repository_id,
        offset=offset,
        limit=limit
    )
    
    return FileListResponse(
        files=[FileResponse.model_validate(f) for f in files],
        total=total
    )


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: int,
    db: DbSession,
    current_user: CurrentUser
):
    """Get file metadata by ID."""
    file_service = FileService(db)
    file = await file_service.get_file(file_id, current_user.id)
    
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    return FileResponse.model_validate(file)


@router.get("/{file_id}/content")
async def get_file_content(
    file_id: int,
    db: DbSession,
    current_user: CurrentUser
):
    """Get file content."""
    file_service = FileService(db)
    file = await file_service.get_file(file_id, current_user.id)
    
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    content = await file_service.get_file_content(file)
    
    if content is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File content not found"
        )
    
    # Return as text for code files
    try:
        text_content = content.decode('utf-8')
        return {"content": text_content, "file": FileResponse.model_validate(file)}
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is not a text file"
        )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: int,
    db: DbSession,
    current_user: CurrentUser
):
    """Delete a file."""
    file_service = FileService(db)
    deleted = await file_service.delete_file(file_id, current_user.id)
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
