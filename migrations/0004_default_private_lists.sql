-- Make all existing lists private; users can opt-in to public explicitly
UPDATE lists SET is_public = 0 WHERE is_public = 1;

-- Change column default to 0 (private) for new lists
-- SQLite doesn't support ALTER COLUMN DEFAULT, so we recreate the table
CREATE TABLE lists_new (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL,
  recipient_id   TEXT,
  title          TEXT NOT NULL,
  emoji          TEXT NOT NULL DEFAULT '📋',
  category       TEXT NOT NULL DEFAULT 'custom',
  secondary_label TEXT,
  is_public      INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (recipient_id) REFERENCES users(id)
);

INSERT INTO lists_new SELECT * FROM lists;
DROP TABLE lists;
ALTER TABLE lists_new RENAME TO lists;
