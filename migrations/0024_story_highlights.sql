-- Migration: 0024_story_highlights
-- Book-reader story: readers highlight a passage and thread comments on it.

CREATE TABLE IF NOT EXISTS story_highlights (
  id           TEXT    NOT NULL PRIMARY KEY,
  story_id     TEXT    NOT NULL,
  para_index   INTEGER NOT NULL,          -- which paragraph (0-based)
  start_offset INTEGER NOT NULL,          -- char offset within the paragraph's plain text
  end_offset   INTEGER NOT NULL,
  quote        TEXT    NOT NULL,          -- the highlighted text (denormalized for display)
  user_id      TEXT    REFERENCES users(id) ON DELETE SET NULL,
  author_name  TEXT    NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_story_highlights_story ON story_highlights(story_id);

CREATE TABLE IF NOT EXISTS story_highlight_comments (
  id           TEXT    NOT NULL PRIMARY KEY,
  highlight_id TEXT    NOT NULL REFERENCES story_highlights(id) ON DELETE CASCADE,
  user_id      TEXT    REFERENCES users(id) ON DELETE SET NULL,
  author_name  TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_story_hl_comments_hl ON story_highlight_comments(highlight_id);
