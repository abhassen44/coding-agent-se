"""File and repository API endpoints."""
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
