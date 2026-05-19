-- Migration: 0014_check_ins
-- Global daily check-in: record that a user visited the site on a given day

CREATE TABLE IF NOT EXISTS check_ins (
  id         TEXT    NOT NULL PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users(id),
  date_str   TEXT    NOT NULL,  -- YYYY-MM-DD (client local date)
  emoji      TEXT,              -- feeling emoji chosen by user
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS check_ins_user_date ON check_ins(user_id, date_str);
CREATE INDEX IF NOT EXISTS check_ins_user_id ON check_ins(user_id);
