-- Migration: 0001_initial
-- Creates the base schema for miemie-aowu

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE lists (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id),
  recipient_id    TEXT REFERENCES users(id),
  title           TEXT NOT NULL,
  emoji           TEXT NOT NULL DEFAULT '📋',
  category        TEXT NOT NULL DEFAULT 'custom',
  secondary_label TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE items (
  id          TEXT PRIMARY KEY,
  list_id     TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  secondary   TEXT,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'unseen',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE item_photos (
  id        TEXT PRIMARY KEY,
  item_id   TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  r2_key    TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE invite_links (
  token      TEXT PRIMARY KEY,
  list_id    TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  used_by    TEXT REFERENCES users(id)
);

CREATE INDEX idx_lists_owner    ON lists(owner_id);
CREATE INDEX idx_lists_recipient ON lists(recipient_id);
CREATE INDEX idx_items_list     ON items(list_id);
CREATE INDEX idx_item_photos_item ON item_photos(item_id);
