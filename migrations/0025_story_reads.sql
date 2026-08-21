-- Migration: 0025_story_reads
-- Per-user read receipts for the story reader: who opened it, when, and how far
-- they've read (furthest scroll fraction, 0..1). One row per (user, story).

CREATE TABLE IF NOT EXISTS story_reads (
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id      TEXT    NOT NULL,
  progress      REAL    NOT NULL DEFAULT 0,  -- furthest fraction read, 0..1
  first_read_at INTEGER NOT NULL,
  last_read_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, story_id)
);
CREATE INDEX IF NOT EXISTS idx_story_reads_story ON story_reads(story_id);
