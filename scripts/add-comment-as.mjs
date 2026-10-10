// Dev helper: add a COMMENT to an item AS ANOTHER USER, via the real local API.
// Lets you test the "new comment from someone else" dot/divider without a 2nd browser.
//
// Usage:
//   node scripts/add-comment-as.mjs <listId> <itemIdOrNamePrefix> "<comment>" [asUsername=alice]
//
// Examples:
//   node scripts/add-comment-as.mjs n1cLsjuF1Swqdw4vvKk5t "La Crema" "love this one"
//   node scripts/add-comment-as.mjs n1cLsjuF1Swqdw4vvKk5t 40728fd6 "love this one" alice
//
// Posting a comment bumps the item's AND the list's updated_at (so the item gets a
// blue dot and the list gets one on the home page), without touching your own
// watermark. Dev-only — not imported by the app.

import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const [, , listId, itemArg, body, asUsername = "alice"] = process.argv;
if (!listId || !itemArg || !body) {
  console.error('Usage: node scripts/add-comment-as.mjs <listId> <itemIdOrNamePrefix> "<comment>" [asUsername=alice]');
  process.exit(1);
}

const secret = fs.readFileSync(".env.local", "utf8").match(/JWT_SECRET=(.*)/)[1].trim();

// The local SQLite database the dev server uses (see src/lib/db.ts).
const db = process.env.DB_PATH ?? "data/miemie.db";

const sql = (q) => execSync(`sqlite3 "${db}" "${q.replace(/"/g, '""')}"`).toString().trim();

const userId = sql(`SELECT id FROM users WHERE username='${asUsername}';`);
if (!userId) {
  console.error(`No user named "${asUsername}" in local DB.`);
  process.exit(1);
}

// Resolve the item: exact id match, else name prefix (case-sensitive LIKE).
const safeItem = itemArg.replace(/'/g, "''");
const itemRow = sql(
  `SELECT id || '|' || name FROM items WHERE list_id='${listId}' AND (id='${safeItem}' OR name LIKE '${safeItem}%') LIMIT 1;`
);
if (!itemRow) {
  console.error(`No item matching "${itemArg}" in list ${listId}. Items in this list:`);
  console.error(sql(`SELECT '  ' || substr(id,1,8) || '  ' || name FROM items WHERE list_id='${listId}';`));
  process.exit(1);
}
const [itemId, itemName] = itemRow.split("|");

const b64 = (b) => Buffer.from(b).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const payload = b64(JSON.stringify({ sub: userId, iat: now, exp: now + 31536000 }));
const data = `${header}.${payload}`;
const token = `${data}.${crypto.createHmac("sha256", secret).update(data).digest("base64url")}`;

const res = await fetch(`http://localhost:4200/api/lists/${listId}/comments`, {
  method: "POST",
  headers: { Cookie: `token=${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ body, itemId }),
});
console.log(res.status, await res.json());
console.log(`Commented on "${itemName}" as ${asUsername}. Reload the list as yourself — that item gets a dot and floats above the divider.`);
