// Apply pending migrations/*.sql to the SQLite database (DB_PATH, default
// data/miemie.db). Tracks applied files in the same `d1_migrations` table that
// wrangler used, so a database exported from D1 picks up where it left off.
//
// Usage: node scripts/migrate.mjs

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.DB_PATH ?? "data/miemie.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`);

const applied = new Set(db.prepare("SELECT name FROM d1_migrations").pluck().all());
const pending = fs
  .readdirSync("migrations")
  .filter((f) => f.endsWith(".sql") && !applied.has(f))
  .sort();

for (const file of pending) {
  const sql = fs.readFileSync(path.join("migrations", file), "utf8");
  db.transaction(() => {
    db.exec(sql);
    db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
  })();
  console.log(`applied ${file}`);
}
console.log(pending.length ? `${pending.length} migration(s) applied to ${dbPath}` : `${dbPath} is up to date`);
