CREATE TABLE list_views (
  user_id   TEXT NOT NULL,
  list_id   TEXT NOT NULL,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, list_id),
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);
