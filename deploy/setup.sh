#!/usr/bin/env bash
# One-time provisioning of a fresh Ubuntu 22.04/24.04 server. Run as root:
#   scp -r deploy root@<IP>:/root/ && ssh root@<IP> bash /root/deploy/setup.sh
set -euo pipefail
cd "$(dirname "$0")"

apt-get update
apt-get install -y curl rsync sqlite3 build-essential python3 debian-keyring debian-archive-keyring apt-transport-https gnupg rclone

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Caddy
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# 2 GB swap so `next build` doesn't run out of memory on a small box
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

# App user + directories
id miemie >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin miemie
mkdir -p /opt/miemie/src /opt/miemie/app /var/lib/miemie/photos /var/lib/miemie/backups
chown -R miemie:miemie /opt/miemie /var/lib/miemie

# Secrets (fill in after setup — same values as the old `wrangler secret`s)
if [ ! -f /etc/miemie.env ]; then
  cat > /etc/miemie.env <<'ENV'
JWT_SECRET=
ADMIN_SECRET=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
SERPER_API_KEY=
AMAP_API_KEY=
ENV
  chmod 600 /etc/miemie.env
fi

cp miemie.service /etc/systemd/system/miemie.service
cp Caddyfile /etc/caddy/Caddyfile
cp backup.sh /usr/local/bin/miemie-backup && chmod +x /usr/local/bin/miemie-backup
echo "15 3 * * * root /usr/local/bin/miemie-backup >> /var/log/miemie-backup.log 2>&1" > /etc/cron.d/miemie-backup

systemctl daemon-reload
systemctl enable miemie caddy
systemctl restart caddy

echo
echo "Done. Next: fill in /etc/miemie.env, run 'rclone config' to add the R2 remote (name it r2),"
echo "then run deploy/deploy.sh <IP> from your laptop."
