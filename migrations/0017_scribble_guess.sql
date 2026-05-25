-- Migration: 0017_scribble_guess
-- The receiver of a scribble plays a guessing game: they see only the
-- drawing, type a guess, and an LLM grades it as exact / similar / wrong.

ALTER TABLE scribbles ADD COLUMN guess_text  TEXT;
ALTER TABLE scribbles ADD COLUMN guess_grade TEXT;  -- 'exact' | 'similar' | 'wrong'
ALTER TABLE scribbles ADD COLUMN guessed_at  INTEGER;
