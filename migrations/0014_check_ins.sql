-- Migration: 0014_check_ins
-- Adds check-in feature: users can intentionally check in at an item's location

CREATE TABLE IF NOT EXISTS check_ins (
  id              TEXT NOT NULL PRIMARY KEY,
  item_id         TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  list_id         TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id),
  user_display_name TEXT NOT NULL,
  latitude        REAL,
  longitude       REAL,
  note            TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS check_ins_item_id ON check_ins(item_id);
CREATE INDEX IF NOT EXISTS check_ins_user_id ON check_ins(user_id);
