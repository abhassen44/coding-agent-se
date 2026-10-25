"""Backfill owner_id into existing Qdrant payloads.

Run once after upgrading to tenant-scoped vector search. Existing points created
before owner_id was added will otherwise be invisible to owner-filtered queries.

Usage:
    python scripts/backfill_vector_owners.py
    python scripts/backfill_vector_owners.py --batch-size 500
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from qdrant_client import QdrantClient

from app.core.config import get_settings
from app.core.database import async_session_maker
from app.models.file import File, FileChunk

settings = get_settings()


async def backfill(batch_size: int, dry_run: bool) -> tuple[int, int]:
    client = QdrantClient(
        host=settings.qdrant_host,
        port=settings.qdrant_port,
        check_compatibility=False,
    )
    updated = 0
    missing = 0
    offset = 0

    async with async_session_maker() as db:
        while True:
            result = await db.execute(
                select(FileChunk.id, File.owner_id)
                .join(File, File.id == FileChunk.file_id)
                .order_by(FileChunk.id)
                .offset(offset)
                .limit(batch_size)
            )
            rows = result.all()
            if not rows:
                break

            if not dry_run:
                for chunk_id, owner_id in rows:
                    try:
                        client.set_payload(
                            collection_name=settings.qdrant_collection,
                            payload={"owner_id": owner_id},
                            points=[chunk_id],
                            wait=True,
                        )
                        updated += 1
                    except Exception:
                        missing += 1
            else:
                updated += len(rows)

            offset += len(rows)

    client.close()
    return updated, missing


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    updated, missing = asyncio.run(backfill(args.batch_size, args.dry_run))
    print(f"{'Would update' if args.dry_run else 'Updated'} {updated} points; {missing} missing")


if __name__ == "__main__":
    main()
