import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { GUESS_TIMER_MS } from "@/lib/scribbleGrade";

// Marks a scribble as viewed by its receiver. This is the wall-clock anchor
// the server uses to compute time_used_ms for each subsequent guess, so the
// guesser's timer is tamper-proof regardless of what the client reports.
//
// Idempotent: subsequent calls don't reset viewed_at — reopening a scribble
// doesn't restart the clock.
export async function POST(req: NextRequest) {
  return withAuth(async (userId) => {
    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    const id = body?.id?.trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const db = await getDB();
    const row = await db
      .prepare(
        `SELECT id, viewed_at, final_grade
         FROM scribbles
         WHERE id = ? AND receiver_id = ?
         LIMIT 1`
      )
      .bind(id, userId)
      .first<{ id: string; viewed_at: number | null; final_grade: string | null }>();

    if (!row) return NextResponse.json({ error: "Scribble not found" }, { status: 404 });

    let viewedAt = row.viewed_at;
    if (viewedAt == null) {
      viewedAt = Date.now();
      await db
        .prepare("UPDATE scribbles SET viewed_at = ? WHERE id = ? AND receiver_id = ?")
        .bind(viewedAt, id, userId)
        .run();
    }

    const now = Date.now();
    const elapsed = now - viewedAt;
    const remainingMs = Math.max(0, GUESS_TIMER_MS - elapsed);

    return NextResponse.json({
      viewedAt,
      timerMs: GUESS_TIMER_MS,
      remainingMs,
      // Lets the client decide to skip the input UI if the timer has already
      // run out (e.g., user reopens after the budget expired) or the game
      // was finished earlier.
      finished: row.final_grade !== null || remainingMs <= 0,
    });
  });
}
