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
- Upstream: Cloudflare anycast IPs pinned in `cf_edge`, Host/SNI
  `cf-origin.miemieaowu.ai` (`miemie-upstream.conf`) — a Worker custom domain
  on `miemie-aowu-webapp` (production) that stays proxied when the apex DNS
  later points at DMIT. Attached 2026-10-10 via the Workers domains API.
- Logs: `/var/log/nginx/shadow.access.log` (upstream time, cache status, cf-ray).
- **Live since 2026-10-10 21:28 PDT:** `miemieaowu.ai` and `www` are DNS-only A records
  (TTL 60) → `191.222.220.97`. `hk-test.miemieaowu.ai` is the original shadow test name.
- **Rollback to direct Cloudflare (DNS):** delete the two A records, then re-attach
  `miemieaowu.ai` and `www` as Worker custom domains (dashboard → Workers & Pages →
  miemie-aowu-webapp → Domains & Routes, or `PUT /accounts/:id/workers/domains`).
  The maintainer's laptop has this scripted as `~/miemie-rollback.sh`. Also restore the
  two routes in `wrangler.toml` so the next deploy doesn't remove them.
- Rollback of nginx changes only: full pre-shadow backup at
  `/root/backup-20261010-203947-pre-shadow`.
