import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

// Marks every unread scribble received by the current user as viewed.
export async function POST() {
  return withAuth(async (userId) => {
    const db = await getDB();
    const now = Date.now();
    await db
      .prepare(
        `UPDATE scribbles
         SET viewed_at = ?
         WHERE receiver_id = ? AND viewed_at IS NULL`
      )
      .bind(now, userId)
      .run();
    return NextResponse.json({ ok: true, viewedAt: now });
  });
}
