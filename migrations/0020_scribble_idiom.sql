-- Migration: 0020_scribble_idiom
-- Pivot Scribble from English IELTS words to Chinese idioms (成语).
-- The original `word` column now holds the idiom string (e.g. "爱才若渴").
-- We also keep a foreign-key reference to the idioms table so the receiver
-- can look up pinyin / explanation on demand. sentence_en/sentence_zh
-- become unused for new rows (left NULL) and may be dropped later.

ALTER TABLE scribbles ADD COLUMN idiom_id INTEGER REFERENCES idioms(id);

-- Make legacy IELTS scribbles uniformly "not idiom-flavoured": they have
-- idiom_id IS NULL and will simply not surface in the inbox after the
-- inbox query filters on idiom_id.
