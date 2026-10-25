#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/ica"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# PostgreSQL
docker exec ica_postgres pg_dump -U postgres ica | gzip > "$BACKUP_DIR/postgres-$STAMP.sql.gz"

# Qdrant snapshot (optional; requires the collection to exist)
curl -fsS -X POST "http://127.0.0.1:6333/collections/ica_code_chunks/snapshots" \
  > "$BACKUP_DIR/qdrant-$STAMP.json" || true

# Keep 7 days
find "$BACKUP_DIR" -type f -mtime +7 -delete
echo "Backup complete: $BACKUP_DIR"
