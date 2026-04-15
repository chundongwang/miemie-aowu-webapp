# 🐑 咩咩~嗷呜 🐺 — Feature Reference

## Overview

A curated-recommendations sharing app. One user builds a list of things they love (cafes, songs, restaurants, books…) and shares it with someone they care about. The recipient can browse, track what they've tried, react, comment, and now co-edit.

**Stack:** Next.js 16 · TypeScript · Tailwind CSS · Cloudflare Workers · D1 (SQLite) · R2 (object storage) · OpenRouter LLM

---

## 1. Authentication

### Standard Login / Register
- Register with **username** (lowercase, 3–30 chars), optional **display name**, optional **phone**, and **password** (min 8 chars).
- Login sets a 1-year HTTP-only JWT cookie.

### 🐑 咩~ Passwordless Login
A social + vocabulary challenge that replaces the password when forgotten.

**Two conditions must both pass to log in:**

1. **Social proof** — enter a username of someone you've shared a list with. The server verifies a shared-list link exists between the two accounts (either direction). Failure message is intentionally vague (no account enumeration).
2. **IELTS word challenge** — a random IELTS-level English word is shown. You must either use it correctly in an English sentence, or provide an accurate Chinese translation.

A LLM (Prof. Pemberton-Higgins, a mercilessly critical teacher) evaluates the answer. On success:
- A 5-second countdown shows with a progress bar.
- Prof. Higgins delivers a backhanded compliment (or devastating critique if wrong).
- At zero the auth cookie is set server-side and you are redirected to `/lists`.

If the word challenge fails you can retry with the same word or request a new one.

**Routes:** `GET /api/vocab-challenge/word` · `POST /api/auth/login-challenge`

### Admin Password Reset
`POST /api/admin/reset-password` — protected by `ADMIN_SECRET` bearer token. Takes `{ username, newPassword }`, hashes with PBKDF2, updates the DB.

---

## 2. Lists

### Create
- Title (required), emoji picker, category (Coffee · Music · Restaurant · Book · Movie · Custom), public/private toggle.
- Category auto-fills a **secondary field label** (e.g. *Address* for coffee shops, *Artist* for music).

### View & Discover
- **`/lists`** — your dashboard of owned lists and lists shared with you.
- **`/`** — public homepage showing 12 random public lists for unauthenticated visitors.

### Edit (owner only)
- Change title, emoji, secondary field label.
- Toggle **public / private** (public lists appear on the homepage).

### Share (owner only)
- Share with one user by their username.
- Recipient gets co-editing access (see §4).
- **Unshare warning** names the recipient and notes their items will remain.

### Delete (owner only)
- Deletes the list and all its items. Cascade-deletes photos from R2.

---

## 3. Items

### Add
- Name (required), secondary field (e.g. address, artist), reason/why (optional).
- Available to owner and shared recipient.

### Status Tracking
Three states cycle in order: **· unseen → ★ saved → ✓ done → · unseen**
Both owner and recipient can cycle status.

### Edit
Click the item name to open the edit sheet (owner and recipient).
Fields: name, secondary, reason.

### Delete
✕ button on each row/card (owner and recipient).

### Reorder
Drag-and-drop in list view. Owner only.

### Bulk Import (AI-powered)
A two-step flow from a "**AI**" button above the + FAB:
1. Paste any text — notes, markdown, messages, anything.
2. Click **Parse with AI** → LLM extracts structured items (name, secondary, reason, image URLs).
3. Review and edit the parsed items in a preview list.
4. Click **Add N items** → items are batch-inserted in one DB transaction.

A live progress bar shows 0→40% during AI parsing (animated) then 40→100% via SSE as each item is saved.

**Routes:** `POST /api/lists/[id]/items/parse` · `POST /api/lists/[id]/items/bulk`

---

## 4. Co-editing (Shared Recipient)

When a list is shared with a user, that user becomes a **co-editor** and can:

| Action | Owner | Recipient | Guest |
|---|:---:|:---:|:---:|
| View items | ✓ | ✓ | ✓ (public lists) |
| Add items | ✓ | ✓ | — |
| Edit items | ✓ | ✓ | — |
| Delete items | ✓ | ✓ | — |
| Upload / delete photos | ✓ | ✓ | — |
| Cycle item status | ✓ | ✓ | — |
| Drag to reorder | ✓ | — | — |
| Edit list metadata | ✓ | — | — |
| Share / unshare | ✓ | — | — |
| Toggle public/private | ✓ | — | — |
| Delete list | ✓ | — | — |
| React 咩~/嗷～ | ✓ | ✓ | — |
| Comment | ✓ | ✓ | — |

Items added by a co-editor **remain after the list is unshared**.

---

## 5. Photos

### Upload
- Up to **3 photos** per item.
- Upload via file picker, camera (Capacitor native), or paste from clipboard.
- Max 5 MB per image. Stored in Cloudflare R2, served from `/api/photos/[key]`.

### Search (Serper / Google Images)
A **🔍 search** button opens a photo search modal:
- Pre-filled with the item name as query.
- Shows a 3-column thumbnail grid (source domain shown on each).
- Clicking a thumbnail: the Worker downloads the full image and stores it in R2.

Available in two contexts:
- **On existing items** (list view): server downloads directly to R2 and attaches to the item.
- **In Add Item modal**: image is proxy-fetched through `/api/proxy-image` into the browser, then staged as a regular file upload submitted with the item form.

**Requires:** `SERPER_API_KEY` secret.

### Lightbox
Click any photo thumbnail to view it full-screen. Click outside or press Esc to close.

---

## 6. Reactions

Two reaction buttons appear on every item (logged-in users only):
- **咩~** (the sheep sound)
- **嗷～** (the wolf sound)

Each tap adds +1 (unlimited). Counts update optimistically. The list header shows aggregate totals (e.g. *咩~ 12 · 嗷～ 7*) once any reactions exist.

**Route:** `POST /api/items/[id]/reactions`

---

## 7. Comments

Available to logged-in users only. Two scopes:

- **Item-level** — each item row has a 💬 count. Tapping it expands an inline comment thread.
- **List-level** — a comment section at the bottom of the list page.

All comments for a list are fetched in one call and filtered client-side.
List-level comments in the bottom section show which item they reference when applicable.

**Routes:** `GET /api/lists/[id]/comments` · `POST /api/lists/[id]/comments`

---

## 8. Views

### List View (default)
- Vertically stacked rows divided by hairlines.
- Drag handle visible to the owner for reordering.
- Photos shown as small 64×64 thumbnails in a row.

### Waterfall / Grid View
- Toggled with ⊞/☰ in the header, available to all users.
- **Pinterest-style masonry** — 2 columns, items flow by height.
- **One card per photo**: an item with 3 photos produces 3 cards, each showing one photo with the item's name below. Items without photos get a single text-only card.
- Reaction and comment controls still accessible per card.

---

## 9. Internationalisation

All UI strings are in `src/lib/translations.ts` with **English** and **Chinese (Simplified)** entries.

- **Server-side**: `getT()` reads the `Accept-Language` header.
- **Client-side**: `useT()` hook from `LocaleContext`, `useLocale()` for the locale code.

The LLM (Prof. Higgins, bulk import parser) receives the user's locale and responds in the same language.

---

## 10. Infrastructure

| Concern | Technology |
|---|---|
| Runtime | Cloudflare Workers (via `@opennextjs/cloudflare`) |
| Database | Cloudflare D1 (SQLite, edge-accessible from China via JD Cloud) |
| Object storage | Cloudflare R2 |
| Custom domain | `miemieaowu.ai` + `www.miemieaowu.ai` |
| LLM | OpenRouter — default model `qwen/qwen-plus`, configurable via `OPENROUTER_MODEL` secret |
| Image search | Serper (Google Images API) — requires `SERPER_API_KEY` |
| Auth | PBKDF2 password hashing · HMAC-SHA256 JWT · HTTP-only cookie · 1-year TTL |
| Mobile | Capacitor 6 shell for iOS / Android |

### Required Secrets
| Secret | Purpose |
|---|---|
| `JWT_SECRET` | Signs auth tokens |
| `OPENROUTER_API_KEY` | LLM calls (bulk import parser, word challenge) |
| `SERPER_API_KEY` | Google Images search for photo picker |
| `ADMIN_SECRET` | Admin password reset endpoint |
| `OPENROUTER_MODEL` | *(optional)* Override default LLM model |

### DB Migrations
```
migrations/
  0001_initial.sql           — users, lists, items, item_photos
  0002_simplify_auth_public_lists.sql — phone column, is_public flag
  0003_reactions_comments.sql — reactions, comments tables
```

Apply to production: `npx wrangler d1 migrations apply miemie-aowu-db --remote`
Apply locally: `npx wrangler d1 migrations apply miemie-aowu-db --local`
