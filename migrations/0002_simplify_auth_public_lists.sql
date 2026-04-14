-- Migration: 0002
-- 1. Make email nullable and add phone column on users (SQLite requires table recreation)
-- 2. Add is_public flag to lists

CREATE TABLE users_new (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT UNIQUE,
  phone         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
INSERT INTO users_new (id, username, email, password_hash, display_name, created_at)
  SELECT id, username, email, password_hash, display_name, created_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

ALTER TABLE lists ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1;
