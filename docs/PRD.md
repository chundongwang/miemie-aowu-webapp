# Product Requirements Document

## Overview

A cross-platform recommendation sharing app where one user curates lists of things and shares them with another user. Think of it as a personal "things I want you to try" — coffee shops, songs, restaurants, books, anything.

## Target Platforms

- **Web** — Next.js web app, primary interface
- **Mobile** — iOS and Android via Capacitor wrapping the Next.js app

## Core Concept

A **List** is a curated collection of **Items** that one user (the sender) shares with another (the recipient). Each list has a theme — coffee shops, music, books — but the app is generic enough to support any category.

---

## User Stories

### Lists

- As a user, I can create a new list with a title and an emoji icon (e.g., ☕ Cafes to Try, 🎵 Songs for You)
- As a user, I can add items to a list
- As a user, I can share a list with another user by username or invite link
- As a recipient, I can view a shared list and mark items as "tried" or "saved"
- As a user, I can have multiple active lists at a time

### Items

Each item belongs to exactly one list. The fields depend on the list's category, but the base structure is shared:

| Field | Required | Notes |
|---|---|---|
| Name | Yes | Name of the thing |
| Secondary | No | Artist (for music), Address (for places), Author (for books), etc. |
| Reason | No | Why the sender recommends it |
| Photos | No | Up to 3 photos |

### Item States (recipient side)

- `unseen` — default when item is added to a shared list
- `saved` — recipient wants to remember it
- `done` — recipient has tried/listened/read it

### Notifications

- Sender is notified when the recipient marks an item as done
- Recipient is notified when new items are added to a shared list

---

## List Categories (v1)

The app ships with a few built-in category templates that pre-fill the secondary field label and the default emoji. Users can also create a "custom" list with no template.

| Category | Emoji default | Secondary field label |
|---|---|---|
| Coffee Shops | ☕ | Address |
| Music | 🎵 | Artist |
| Restaurants | 🍜 | Address |
| Books | 📚 | Author |
| Movies | 🎬 | Director |
| Custom | — | (user-defined or blank) |

The category is just a UI hint — the data model is the same for all.

---

## User Model

- Simple email + password auth (no OAuth v1)
- Each user has a display name and a unique username (used for sharing)
- Single-user scope for v1: one sender, one recipient per list (not a group feature)

---

## Sharing Model

- A list can be shared with exactly one other user (v1 keeps it personal)
- Sharing is done via username lookup or a one-time invite link
- The recipient can view but not add/edit items (v1)
- The sender can revoke sharing at any time

---

## Out of Scope (v1)

- Group lists / multiple recipients
- Comments or reactions on items
- Social discovery (finding strangers' lists)
- Rich link previews (auto-fetching metadata from URLs)
- Offline mode (Capacitor PWA will require network)

---

## UX Notes

- Mobile-first layout; the web app should feel like a native app
- Swipe-to-mark-done on mobile (Capacitor gesture)
- Photo upload should use the native camera/gallery picker on mobile via Capacitor Camera plugin
- The emoji picker for list icons should be native OS emoji keyboard on mobile

---

## Success Metrics (v1)

- A user can create a list, add 3+ items with photos, and share it with another user within 5 minutes of signing up
- The recipient can view the list and mark items done without confusion
