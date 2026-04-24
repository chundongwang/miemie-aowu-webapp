-- Migration: 0012_comment_updated_at
-- Adds updated_at to track comment edits

ALTER TABLE comments ADD COLUMN updated_at INTEGER;
