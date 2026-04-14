-- Migration: 0003
-- Add reactions (咩~/嗷～) and comments at list/item level

CREATE TABLE IF NOT EXISTS reactions (
  id          TEXT    PRIMARY KEY,
  item_id     TEXT    NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id     TEXT    REFERENCES users(id) ON DELETE SET NULL,
  type        TEXT    NOT NULL CHECK(type IN ('miemie', 'aowu')),
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reactions_item ON reactions(item_id);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT    PRIMARY KEY,
  list_id     TEXT    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  item_id     TEXT    REFERENCES items(id) ON DELETE CASCADE,
  user_id     TEXT    REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT    NOT NULL,
  body        TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_list ON comments(list_id);
