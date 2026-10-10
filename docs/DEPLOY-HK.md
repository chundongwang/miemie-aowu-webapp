# Hosting on Alibaba Cloud Hong Kong

The app runs as a plain Node.js server on one Hong Kong VM, so mainland China
users reach it in ~30–60 ms instead of crossing the border to a US Cloudflare
PoP. Hong Kong needs no ICP filing.

```
browser ──HTTPS──▶ Caddy (:443, auto Let's Encrypt) ──▶ Next.js standalone (:3000)
                                                         ├─ SQLite  /var/lib/miemie/miemie.db
                                                         └─ photos  /var/lib/miemie/photos/
nightly cron ──▶ SQLite snapshot + photos ──▶ Cloudflare R2 (backup only)
```

`src/lib/db.ts` keeps the D1/R2-shaped API (`getDB()`, `getPhotoBucket()`), so
routes didn't change — only the backing store did.

## 1. Alibaba Cloud account

1. Register at **alibabacloud.com** (international site — not aliyun.com).
   On the first screen choose your real **Country/Region** (e.g. United States).
   The phone field's country code is locked to whatever you pick there, and it
   can't be changed later.
2. Verify email + phone, add a credit card or PayPal. Identity verification
   (passport/licence) may be requested.

## 2. Server

Console → **Simple Application Server** → Create:

| Setting | Value |
|---|---|
| Region | China (Hong Kong) |
| Image | OS image → Ubuntu 24.04 (or 22.04) |
| Plan | ≥ 2 vCPU / 2 GB RAM, ≥ 40 GB disk |

Then:
- Add your SSH public key (or set a root password).
- **Firewall**: allow TCP 22, 80, 443.
- Note the public IP; check `ssh root@<IP>` works.
- Sanity check from the mainland if you can: `ping <IP>` should be ~20–60 ms.

## 3. Provision

```bash
scp -r deploy root@<IP>:/root/
ssh root@<IP> bash /root/deploy/setup.sh
```

Installs Node 22, Caddy, sqlite3, rclone, 2 GB swap, the `miemie` systemd
service and the nightly backup cron. Then on the server:

1. Fill in `/etc/miemie.env` with the same values as the old `wrangler secret`s
   (Cloudflare can't show them back — use your own copies; generating a new
   `JWT_SECRET` logs everyone out).
2. `rclone config` → new remote named **r2**, type `s3`, provider `Cloudflare`,
   with an R2 API token (Cloudflare dashboard → R2 → Manage API tokens, Object
   Read & Write) and endpoint `https://<account-id>.r2.cloudflarestorage.com`.
   Create a bucket named `miemie-aowu-backups` for DB snapshots.

## 4. First deploy (before DNS switch)

```bash
npm run deploy -- <IP>
```

Uploads the source, builds on the server (better-sqlite3 is native, so it's
compiled on Linux), runs `scripts/migrate.mjs`, restarts the service.
Caddy can't get a certificate until DNS points here — that's expected for now.
Test with an SSH tunnel: `ssh -L 3000:127.0.0.1:3000 root@<IP>` → http://localhost:3000.

## 5. Cutover

1. Lower the TTL on the `miemieaowu.ai` / `www` records in Cloudflare DNS a day ahead.
2. Announce a few minutes of read-only time (no posting).
3. Copy the data (from your laptop, `wrangler login`ed):
   ```bash
   bash deploy/migrate-from-cloudflare.sh <IP>
   ```
   Exports D1 → imports into SQLite, copies photos from R2, prints row counts
   on both sides — check they match.
4. In Cloudflare DNS: remove the Worker custom domains, then add `A` records for
   `miemieaowu.ai` and `www` → `<IP>` with the proxy **off (grey cloud)**. If the
   orange cloud stays on, China traffic still goes via Cloudflare's US PoPs.
5. Caddy obtains certificates within a minute. Check https://miemieaowu.ai.
6. Keep the Cloudflare Worker deployed but unrouted for a week as a rollback
   (its D1 will be stale after cutover, so rolling back loses new writes).

## Day to day

| Task | Command |
|---|---|
| Deploy | `npm run deploy -- <IP>` |
| Logs | `ssh root@<IP> journalctl -u miemie -f` |
| New migration | add `migrations/00NN_*.sql`; deploy applies it |
| Manual backup | `ssh root@<IP> miemie-backup` |
| Restore DB | `systemctl stop miemie`, `gunzip` a snapshot over `/var/lib/miemie/miemie.db`, start |
| OS updates | `ssh root@<IP> 'apt-get update && apt-get -y upgrade'` |

## Known caveats

- **LLM calls**: OpenRouter routes to providers some of which refuse Hong Kong
  IPs. The default model (`qwen/qwen-plus`) should be fine; if a model returns
  region errors, pick another or proxy `src/lib/llm.ts` through a small
  Worker outside HK.
- **Single box**: no redundancy. The nightly R2 backup is the safety net.
- **Users outside China** are now served from HK too (slightly slower than a
  nearby Cloudflare PoP for US/EU users).
