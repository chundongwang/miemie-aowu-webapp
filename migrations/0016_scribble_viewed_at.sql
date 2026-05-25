-- Migration: 0016_scribble_viewed_at
-- Track when the receiver has viewed a scribble (NULL = unread).

ALTER TABLE scribbles ADD COLUMN viewed_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_scribbles_receiver_unread
  ON scribbles(receiver_id, viewed_at);
