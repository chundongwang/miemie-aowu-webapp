# 🐑 咩咩~嗷呜 🐺

A curated-recommendations sharing app. Build lists of things you love and share them with the people you care about. See [`docs/features.md`](docs/features.md) for the full feature reference.

**Live:** https://miemieaowu.ai



---

## Prerequisites

- Node.js 22+

---

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Create the local database

```bash
npm run db:migrate
```

Creates `data/miemie.db` (SQLite) and applies `migrations/*.sql`. Photos uploaded locally go to `data/photos/`.

### 3. Set local environment variables

Create `.env.local` at the project root (never commit this file):

```bash
# .env.local

# Required — sign JWT auth tokens
JWT_SECRET=any-long-random-string

# Required — LLM (bulk import parser, word challenge)
# Get a free key at https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-...

# Optional — override the default LLM model (default: qwen/qwen-plus)
# Browse models at https://openrouter.ai/models
OPENROUTER_MODEL=qwen/qwen-plus

# Optional — Google Images search for the photo picker
# Get a free key at https://serper.dev (2 500 free queries/month)
SERPER_API_KEY=...

# Optional — admin password reset endpoint
ADMIN_SECRET=any-strong-random-string
```

### 4. Start the dev server

```bash
npm run dev
```

The app runs at http://localhost:4200. Hot-reload is enabled.

---

## Hosting

Production runs on an Alibaba Cloud Hong Kong VM (fast from mainland China, no ICP filing needed). Server setup, cutover from Cloudflare, backups and operations are in [`docs/DEPLOY-HK.md`](docs/DEPLOY-HK.md).

## Deploy

```bash
npm run deploy -- <server IP>
```

Uploads the source, builds on the server, applies migrations, restarts the service.

---

## iOS (Capacitor)

The iOS app is a Capacitor shell that loads the live web app from `https://miemieaowu.ai`. No static export is needed — native features (camera, haptics, status bar) work via the Capacitor bridge.

### First-time setup

**Prerequisites:** Xcode 15+, CocoaPods (`brew install cocoapods`)

```bash
# 1. Create the Xcode project (only once)
npm run ios:add

# 2. Sync web assets and plugins
npm run ios:sync

# 3. Open in Xcode to set signing + bundle ID
npm run ios:open
```

In Xcode:
1. Select the `App` target → **Signing & Capabilities**
2. Set your **Team** and confirm **Bundle Identifier** is `com.miemieaowu.app`
3. Build & run on a simulator or device

### Day-to-day

```bash
# After any native plugin or config change
npm run ios:sync

# Run on a connected device or simulator
npm run ios:run

# Open Xcode
npm run ios:open
```

### Dev mode (point to local server)

Set `NODE_ENV=development` before syncing to load from `http://localhost:4200` instead of the live URL:

```bash
NODE_ENV=development npm run ios:sync
```

Then start the web dev server (`npm run dev`) and run the app from Xcode.

---

## Useful Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start local dev server |
| `npm run build` | Type-check + Next.js build |
| `npm run deploy -- <IP>` | Build and deploy to the Hong Kong server |
| `npm run db:migrate` | Apply DB migrations to the local SQLite db |
| `npm run ios:add` | Create the iOS Xcode project (first time only) |
| `npm run ios:sync` | Sync Capacitor plugins and config to iOS |
| `npm run ios:open` | Open Xcode |
| `npm run ios:run` | Run on a simulator or connected device |
| `ssh root@<IP> journalctl -u miemie -f` | Stream live production logs |

---

## Project Structure

```
src/
  app/
    (auth)/           # Login, register pages
    (app)/            # Authenticated pages (lists dashboard, profile)
    api/              # All API routes
    lists/[id]/       # List detail page (public + authenticated)
  components/         # Shared UI components
  context/            # React contexts (locale)
  lib/                # Auth, DB, LLM, i18n, SERP, professor prompt
  types/              # TypeScript types
migrations/           # SQLite migrations (applied in order by scripts/migrate.mjs)
deploy/               # HK server setup, deploy, backup, Cloudflare data migration
docs/
  features.md         # Full feature reference
AGENTS.md             # Guidelines for AI coding agents
wrangler.toml         # Old Cloudflare config — kept for the one-time D1/R2 export
```

---

## Keys Reference

| Key | Required | Where to get it |
|---|:---:|---|
| `JWT_SECRET` | ✓ | Generate any random string: `openssl rand -hex 32` |
| `OPENROUTER_API_KEY` | ✓ | [openrouter.ai/keys](https://openrouter.ai/keys) — free tier available |
| `OPENROUTER_MODEL` | — | [openrouter.ai/models](https://openrouter.ai/models) — default: `qwen/qwen-plus` |
| `SERPER_API_KEY` | — | [serper.dev](https://serper.dev) — 2 500 free queries/month |
| `ADMIN_SECRET` | — | Generate any random string: `openssl rand -hex 32` |
