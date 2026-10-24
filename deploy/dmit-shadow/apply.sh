#!/usr/bin/env bash
# Push the nginx config copies in this directory to the DMIT box, validate,
# purge the asset cache (it may hold zstd/br-encoded variants) and reload.
# Usage: bash deploy/dmit-shadow/apply.sh [user@host]
set -euo pipefail
HOST="${1:-root@191.222.220.97}"
DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP=$(date +%Y%m%d-%H%M%S)

scp "$DIR/miemie-shadow" "$HOST:/tmp/miemie-shadow.$STAMP"
scp "$DIR/miemie-proxy.conf" "$HOST:/tmp/miemie-proxy.conf.$STAMP"
ssh "$HOST" bash -s "$STAMP" <<'REMOTE'
set -euo pipefail
S="$1"
mkdir -p /root/backup-$S-pre-encoding-fix
cp /etc/nginx/sites-available/miemie-shadow /etc/nginx/snippets/miemie-proxy.conf /root/backup-$S-pre-encoding-fix/
install -m 644 /tmp/miemie-shadow.$S /etc/nginx/sites-available/miemie-shadow
install -m 644 /tmp/miemie-proxy.conf.$S /etc/nginx/snippets/miemie-proxy.conf
nginx -t
# Drop every cached object: entries written before this change may be
# zstd/br-encoded and would keep being replayed to clients that can't decode them.
find /var/cache/nginx/miemie -type f -delete
systemctl reload nginx
echo "applied; backup in /root/backup-$S-pre-encoding-fix"
REMOTE
echo "Now run: bash $DIR/verify.sh"
