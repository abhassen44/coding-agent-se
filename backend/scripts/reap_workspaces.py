"""Stop workspaces that have been idle for too long.

Usage:
    python scripts/reap_workspaces.py --minutes 45
    python scripts/reap_workspaces.py --minutes 45 --dry-run

Run from `backend/` with the virtualenv Python. Suitable for cron/systemd timers.
"""
import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.workspace import Workspace
from app.services.workspace_service import WorkspaceService


async def reap(minutes: int, dry_run: bool) -> int:
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=minutes)
    stopped = 0
    async with async_session_maker() as db:
        result = await db.execute(
            select(Workspace).where(
                Workspace.status == "running",
                Workspace.last_accessed_at.is_not(None),
                Workspace.last_accessed_at < cutoff,
            )
        )
        workspaces = list(result.scalars().all())
        for workspace in workspaces:
            print(
                f"{'would stop' if dry_run else 'stopping'} "
                f"workspace={workspace.id} user={workspace.user_id} "
                f"last_accessed={workspace.last_accessed_at}"
            )
            if dry_run:
                stopped += 1
                continue
            try:
                await WorkspaceService(db).stop_workspace(workspace.id, workspace.user_id)
                stopped += 1
            except Exception as exc:
                print(f"  failed: {exc}", file=sys.stderr)
    return stopped


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--minutes", type=int, default=45)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    count = asyncio.run(reap(args.minutes, args.dry_run))
    print(f"{'Matched' if args.dry_run else 'Stopped'} {count} workspace(s)")


if __name__ == "__main__":
    main()
