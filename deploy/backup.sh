#!/usr/bin/env bash
# Nightly: snapshot the SQLite db and copy it + new photos to Cloudflare R2.
# Needs an rclone remote named "r2" (see docs/DEPLOY-HK.md).
set -euo pipefail
STAMP=$(date -u +%Y%m%d-%H%M)
OUT=/var/lib/miemie/backups/miemie-$STAMP.db

sqlite3 /var/lib/miemie/miemie.db ".backup '$OUT'"
gzip "$OUT"
rclone copy "$OUT.gz" r2:miemie-aowu-backups/db/
rclone copy /var/lib/miemie/photos r2:miemie-aowu-photos/ --exclude "*.meta.json"

# keep 14 days of local snapshots
find /var/lib/miemie/backups -name "miemie-*.db.gz" -mtime +14 -delete
echo "$(date -u) backup ok: $OUT.gz"
