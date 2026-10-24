#!/usr/bin/env bash
# Push the nginx config copies in this directory to the DMIT box, validate,
# purge the asset cache (it may hold zstd/br-encoded variants) and reload.
# Usage: DMIT_SSH_KEY=~/path/to/id_rsa.pem bash deploy/dmit-shadow/apply.sh [user@host]
# (the box only accepts the key pair DMIT issued; see README)
set -euo pipefail
HOST="${1:-root@191.222.220.97}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[ -n "${DMIT_SSH_KEY:-}" ] && SSH_OPTS+=(-i "$DMIT_SSH_KEY" -o IdentitiesOnly=yes)
DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP=$(date +%Y%m%d-%H%M%S)

scp "${SSH_OPTS[@]}" "$DIR/miemie-shadow" "$HOST:/tmp/miemie-shadow.$STAMP"
scp "${SSH_OPTS[@]}" "$DIR/miemie-proxy.conf" "$HOST:/tmp/miemie-proxy.conf.$STAMP"
ssh "${SSH_OPTS[@]}" "$HOST" bash -s "$STAMP" <<'REMOTE'
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
