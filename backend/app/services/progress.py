"""In-memory progress tracking for long-running tasks like GitHub import."""

from typing import Optional, Dict, Any

# In-memory store: { repo_id: { status, current, total, message } }
_import_progress: Dict[int, Dict[str, Any]] = {}


def update_progress(
    repo_id: int,
    status: str,
    current: int = 0,
    total: int = 0,
    message: str = "",
):
    """Update import progress for a repository."""
    _import_progress[repo_id] = {
        "status": status,
        "current": current,
        "total": total,
        "percent": round((current / total * 100) if total > 0 else 0),
        "message": message,
    }


def get_progress(repo_id: int) -> Optional[Dict[str, Any]]:
    """Get current import progress for a repository."""
    return _import_progress.get(repo_id)


def clear_progress(repo_id: int):
    """Remove progress entry after completion."""
    _import_progress.pop(repo_id, None)
