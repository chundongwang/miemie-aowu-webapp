-- Migration: 0023_scribble_scoring
-- GPA-style scoring with multi-guess history. The receiver can keep guessing
-- until the timer runs out, an exact match lands, or they reveal the answer.
-- Each attempt is graded S/A/B/C/D/F from (LLM closeness, time used) and
-- stored in scribble_guesses. scribbles.final_grade caches the best grade
-- once the game is over (or null while still active).
--
-- viewed_at (added in 0016) is now load-bearing: it's the wall-clock anchor
-- the server uses to compute time_used_ms for each guess. It gets set on
-- the receiver's first POST /api/scribble/view call.

CREATE TABLE IF NOT EXISTS scribble_guesses (
  id           TEXT    NOT NULL PRIMARY KEY,
  scribble_id  TEXT    NOT NULL REFERENCES scribbles(id),
  guesser_id   TEXT    NOT NULL REFERENCES users(id),
  guess_text   TEXT    NOT NULL,
  closeness    INTEGER,                       -- 0..100, null while LLM is grading
  grade        TEXT,                          -- 'S'|'A'|'B'|'C'|'D'|'F', null while grading
  time_used_ms INTEGER NOT NULL,              -- ms since scribbles.viewed_at
  created_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_scribble_guesses_scribble
  ON scribble_guesses(scribble_id, created_at);

-- Best grade achieved on this scribble. Null while the game is in progress;
-- set to a letter grade ('S'..'F') once the game ends (exact, timer, or reveal).
-- 'F' covers both "ran out of time without a good answer" and "gave up".
ALTER TABLE scribbles ADD COLUMN final_grade TEXT;
