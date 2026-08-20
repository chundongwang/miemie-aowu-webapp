import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

type Params = { params: Promise<{ highlightId: string }> };

// DELETE /api/story/highlights/:highlightId — remove your own highlight (+ its thread)
export async function DELETE(_req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { highlightId } = await params;
    const db = await getDB();

    const hl = await db
      .prepare("SELECT user_id FROM story_highlights WHERE id = ?")
      .bind(highlightId)
      .first<{ user_id: string | null }>();

    if (!hl) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (hl.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Clear the thread first (don't rely on FK cascade being enabled), then the highlight.
    await db.batch([
      db.prepare("DELETE FROM story_highlight_comments WHERE highlight_id = ?").bind(highlightId),
      db.prepare("DELETE FROM story_highlights WHERE id = ?").bind(highlightId),
    ]);

    return NextResponse.json({ ok: true });
  });
}
