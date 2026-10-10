#!/usr/bin/env bash
# One-time data move from Cloudflare (D1 + R2) to the HK server. Run from your
# laptop (logged in with `wrangler login`) during a short write freeze:
#   bash deploy/migrate-from-cloudflare.sh <IP>
set -euo pipefail
HOST="${1:?usage: migrate-from-cloudflare.sh <host>}"
DUMP=$(mktemp -d)/d1.sql

echo "→ exporting D1"
npx wrangler d1 export miemie-aowu-db --remote --output "$DUMP"
grep -q "d1_migrations" "$DUMP" || { echo "export has no d1_migrations table — stop and check"; exit 1; }

echo "→ importing on $HOST"
scp "$DUMP" "root@$HOST:/tmp/d1.sql"
ssh "root@$HOST" bash -s <<'REMOTE'
set -euo pipefail
systemctl stop miemie || true
DB=/var/lib/miemie/miemie.db
[ -f "$DB" ] && mv "$DB" "$DB.before-import.$(date +%s)"
rm -f "$DB-wal" "$DB-shm"
sqlite3 "$DB" < /tmp/d1.sql
sqlite3 "$DB" "PRAGMA journal_mode=WAL; PRAGMA integrity_check;"
for t in users lists items item_photos; do echo "$t: $(sqlite3 "$DB" "SELECT COUNT(*) FROM $t")"; done
chown miemie:miemie "$DB"

echo "→ copying photos from R2"
rclone copy r2:miemie-aowu-photos /var/lib/miemie/photos --exclude "media/**" --transfers 16
echo "photo files: $(find /var/lib/miemie/photos -type f | wc -l)"
chown -R miemie:miemie /var/lib/miemie/photos
systemctl start miemie
REMOTE
echo "Compare the counts above with D1:"
npx wrangler d1 execute miemie-aowu-db --remote --command \
  "SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM lists) lists, (SELECT COUNT(*) FROM items) items, (SELECT COUNT(*) FROM item_photos) item_photos"
