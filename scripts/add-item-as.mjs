// Dev helper: add an item to a list AS ANOTHER USER, via the real local API.
// Lets you test the "new item from someone else" divider without a second browser.
//
// Usage:
//   node scripts/add-item-as.mjs <listId> "<item name>" [asUsername=alice]
//
// It mints a local JWT for the chosen user (reads JWT_SECRET from .env.local),
// resolves their id from the local SQLite db, and POSTs to the running dev
// server (http://localhost:4200). Dev-only — not imported by the app.

import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const [, , listId, name, asUsername = "alice"] = process.argv;
if (!listId || !name) {
  console.error('Usage: node scripts/add-item-as.mjs <listId> "<item name>" [asUsername=alice]');
  process.exit(1);
}

const secret = fs.readFileSync(".env.local", "utf8").match(/JWT_SECRET=(.*)/)[1].trim();

// The local SQLite database the dev server uses (see src/lib/db.ts).
const db = process.env.DB_PATH ?? "data/miemie.db";

const userId = execSync(
  `sqlite3 "${db}" "SELECT id FROM users WHERE username='${asUsername}';"`
)
  .toString()
  .trim();
if (!userId) {
  console.error(`No user named "${asUsername}" in local DB.`);
  process.exit(1);
}

const b64 = (b) => Buffer.from(b).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const payload = b64(JSON.stringify({ sub: userId, iat: now, exp: now + 31536000 }));
const data = `${header}.${payload}`;
const token = `${data}.${crypto.createHmac("sha256", secret).update(data).digest("base64url")}`;

const res = await fetch(`http://localhost:4200/api/lists/${listId}/items`, {
  method: "POST",
  headers: { Cookie: `token=${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ name, secondary: "Château Test", reason: `added by ${asUsername}` }),
});
console.log(res.status, await res.json());
console.log(`Added "${name}" as ${asUsername}. Reload the list as yourself to see it above the divider.`);
