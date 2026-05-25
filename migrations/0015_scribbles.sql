-- Migration: 0015_scribbles
-- Social drawing game: users draw pictures based on IELTS vocabulary words

CREATE TABLE IF NOT EXISTS scribbles (
  id             TEXT    NOT NULL PRIMARY KEY,
  sender_id      TEXT    NOT NULL REFERENCES users(id),
  receiver_id    TEXT    NOT NULL REFERENCES users(id),
  word           TEXT    NOT NULL,
  sentence_en    TEXT    NOT NULL,
  sentence_zh    TEXT    NOT NULL,
  drawing_r2_key TEXT    NOT NULL,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_scribbles_sender   ON scribbles(sender_id);
CREATE INDEX IF NOT EXISTS idx_scribbles_receiver  ON scribbles(receiver_id);