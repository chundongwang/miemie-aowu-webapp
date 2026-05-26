-- Migration: 0022_scribble_prompts
-- Pivot Scribble away from Chinese idioms (too hard to guess from a drawing)
-- to LLM-generated picture-friendly prompts:
--   - category: visible to both drawer and guesser ("零食", "家电", "名人"...)
--   - word: the answer; visible to drawer up-front, to guesser after guessing
--   - drawer_description: 1-sentence context for the drawer
--   - guesser_clue: 1-sentence hint revealed mid-replay to the guesser
--
-- Legacy idiom-based scribbles keep working: scribbles.idiom_id and
-- scribbles.prompt_id are mutually exclusive (one or the other is non-null).

CREATE TABLE IF NOT EXISTS scribble_prompts (
  id                 TEXT    NOT NULL PRIMARY KEY,
  created_by         TEXT    NOT NULL REFERENCES users(id),
  category           TEXT    NOT NULL,
  word               TEXT    NOT NULL,
  drawer_description TEXT    NOT NULL,
  guesser_clue       TEXT    NOT NULL,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_scribble_prompts_creator
  ON scribble_prompts(created_by, created_at);

ALTER TABLE scribbles ADD COLUMN prompt_id TEXT REFERENCES scribble_prompts(id);
