# DMIT Hong Kong shadow (nginx in front of the Cloudflare Worker)

Copies of the live nginx config on the DMIT VPS (`191.222.220.97`, Ubuntu 24.04,
nginx 1.24). See `docs/ios-capacitor-zero-update-routing.md` for the design.

| File | Server path |
|---|---|
| `miemie-shadow` | `/etc/nginx/sites-available/miemie-shadow` (enabled) |
| `benchmark` | `/etc/nginx/sites-available/benchmark` (enabled, default_server :80) |
| `miemie-shadow-http.conf` | `/etc/nginx/conf.d/` — log format, proxy cache, `cf_edge` upstream |
| `benchmark-logformat*.conf` | `/etc/nginx/conf.d/` |
| `miemie-upstream.conf`, `miemie-proxy.conf` | `/etc/nginx/snippets/` |

- TLS: Let's Encrypt via certbot DNS-01 (`/etc/letsencrypt/cloudflare.ini`,
  DNS:Edit token for the zone), cert name `miemieaowu.ai`, SANs `miemieaowu.ai`,
  `www.miemieaowu.ai`, `hk-test.miemieaowu.ai`. Auto-renews via `certbot.timer`
  with a `systemctl reload nginx` deploy hook.
- Upstream: Cloudflare anycast IPs pinned in `cf_edge`, Host/SNI from
  `miemie-upstream.conf` (currently `miemieaowu.ai`; switch to
  `cf-origin.miemieaowu.ai` before the apex DNS points at DMIT).
- Logs: `/var/log/nginx/shadow.access.log` (upstream time, cache status, cf-ray).
- Rollback: `rm /etc/nginx/sites-enabled/miemie-shadow && nginx -t && systemctl reload nginx`;
  full pre-shadow backup at `/root/backup-20261010-203947-pre-shadow`.
