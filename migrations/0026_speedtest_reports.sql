-- Results posted by the public /speedtest page, so the maintainer can read
-- mainland testers' numbers without relaying screenshots.
CREATE TABLE IF NOT EXISTS speedtest_reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  client_ip  TEXT,
  user_agent TEXT,
  report     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_speedtest_reports_created ON speedtest_reports(created_at);
