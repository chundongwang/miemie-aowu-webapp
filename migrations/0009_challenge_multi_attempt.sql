-- Recreate challenge_results with a per-row id so multiple attempts per day are allowed.
CREATE TABLE challenge_results_new (
  id          TEXT    NOT NULL PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  date_str    TEXT    NOT NULL,
  word        TEXT    NOT NULL,
  skipped     INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER,
  comment     TEXT,
  answered_at INTEGER NOT NULL
);

INSERT INTO challenge_results_new (id, user_id, date_str, word, skipped, correct, comment, answered_at)
  SELECT lower(hex(randomblob(16))), user_id, date_str, word, skipped, correct, comment, answered_at
  FROM challenge_results;

DROP TABLE challenge_results;
ALTER TABLE challenge_results_new RENAME TO challenge_results;
CREATE INDEX idx_challenge_results_user_date ON challenge_results (user_id, date_str);
