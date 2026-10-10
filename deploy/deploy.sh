#!/usr/bin/env bash
# Deploy the current working tree to the HK server: upload source, build on the
# server (better-sqlite3 is a native module, so it must be compiled on Linux),
# apply migrations, swap in the new build and restart.
#   npm run deploy -- <IP or ssh host>     (or set DEPLOY_HOST)
set -euo pipefail
HOST="${1:-${DEPLOY_HOST:?usage: deploy.sh <host>}}"
cd "$(dirname "$0")/.."

rsync -az --delete \
  --exclude .git --exclude node_modules --exclude .next --exclude data \
  --exclude ios --exclude .wrangler --exclude .open-next --exclude "public/_modelcompare" \
  --exclude ".env*" --exclude .dev.vars \
  ./ "root@$HOST:/opt/miemie/src/"

ssh "root@$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/miemie/src
chown -R miemie:miemie /opt/miemie
sudo -u miemie npm ci --no-audit --no-fund
sudo -u miemie npm run build
sudo -u miemie DB_PATH=/var/lib/miemie/miemie.db node scripts/migrate.mjs
rsync -a --delete .next/standalone/ /opt/miemie/app/
chown -R miemie:miemie /opt/miemie/app
systemctl restart miemie
sleep 2
systemctl is-active miemie
curl -fsS -o /dev/null -w "local check: HTTP %{http_code}\n" http://127.0.0.1:3000/login
REMOTE
