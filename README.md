# 🐑 咩咩~嗷呜 🐺

A curated-recommendations sharing app. Build lists of things you love and share them with the people you care about. See [`docs/features.md`](docs/features.md) for the full feature reference.

**Live:** https://miemieaowu.ai

[![Deployed on Cloudflare Workers](https://img.shields.io/badge/Deployed%20on-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

---

## Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) — `npm install -g wrangler`
- A Cloudflare account with D1 and R2 enabled

---

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Log in to Cloudflare

```bash
wrangler login
```

### 3. Create the local D1 database and apply migrations

```bash
npx wrangler d1 migrations apply miemie-aowu-db --local
```

### 4. Set local environment variables

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

### 5. Start the dev server

```bash
npm run dev
```

The app runs at http://localhost:3000. Hot-reload is enabled.

---

## Cloudflare Setup (first time)

### Create D1 database

```bash
npx wrangler d1 create miemie-aowu-db
```

Copy the `database_id` printed and update `wrangler.toml` if it differs.

### Create R2 bucket

```bash
npx wrangler r2 bucket create miemie-aowu-photos
```

### Apply migrations to production

```bash
npx wrangler d1 migrations apply miemie-aowu-db --remote
```

### Set production secrets

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put SERPER_API_KEY       # optional
npx wrangler secret put ADMIN_SECRET         # optional
npx wrangler secret put OPENROUTER_MODEL     # optional
```

Each command prompts you to paste the value.

### Custom domain

Add `miemieaowu.ai` (and `www.`) as custom domains in the Cloudflare dashboard under **Workers & Pages → your worker → Settings → Domains & Routes**, or via `wrangler.toml` (already configured).

Set SSL/TLS mode to **Full (strict)** in the Cloudflare dashboard for the zone.

---

## Deploy

```bash
npm run deploy
```

This runs `opennextjs-cloudflare build` then `wrangler deploy`.

---

## Useful Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start local dev server |
| `npm run build` | Type-check + Next.js build |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npx wrangler d1 migrations apply miemie-aowu-db --local` | Apply DB migrations locally |
| `npx wrangler d1 migrations apply miemie-aowu-db --remote` | Apply DB migrations to production |
| `npx wrangler tail` | Stream live production logs |
| `npx wrangler secret put <KEY>` | Set a production secret |

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
migrations/           # D1 SQL migrations (applied in order)
docs/
  features.md         # Full feature reference
AGENTS.md             # Guidelines for AI coding agents
wrangler.toml         # Cloudflare Worker config
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
