-- Migration: 0018_idioms
-- Chinese idiom (成语) dictionary used as the prompt for Scribble drawings.
-- Source: github.com/By-syk/chinese-idiom-db (Apache 2.0)

CREATE TABLE IF NOT EXISTS idioms (
  id          INTEGER PRIMARY KEY,
  idiom       TEXT    NOT NULL,
  pinyin      TEXT    NOT NULL,
  explanation TEXT,
  origin      TEXT,
  example     TEXT
);
