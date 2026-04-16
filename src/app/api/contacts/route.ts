import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getAuthUserId } from "@/lib/auth";

// Returns users the current user has shared lists with (either direction)
export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDB();
  const rows = await db
    .prepare(
      `SELECT DISTINCT u.username, u.display_name
       FROM lists l
       JOIN users u ON (
         (l.owner_id = ? AND u.id = l.recipient_id)
         OR
         (l.recipient_id = ? AND u.id = l.owner_id)
       )
       WHERE u.id IS NOT NULL
       ORDER BY u.display_name
       LIMIT 20`
    )
    .bind(userId, userId)
    .all<{ username: string; display_name: string }>();

  return NextResponse.json(
    rows.results.map((r) => ({ username: r.username, displayName: r.display_name }))
  );
}
