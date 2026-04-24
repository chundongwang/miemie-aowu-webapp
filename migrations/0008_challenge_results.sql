CREATE TABLE challenge_results (
  user_id    TEXT    NOT NULL,
  date_str   TEXT    NOT NULL,  -- "2026-04-22"
  word       TEXT    NOT NULL,
  skipped    INTEGER NOT NULL DEFAULT 0,
  correct    INTEGER,           -- NULL if skipped, 1/0 if answered
  comment    TEXT,              -- professor's comment
  answered_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date_str)
);
