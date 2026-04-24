import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getAuthUserId } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api";

type Params = { params: Promise<{ id: string; commentId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return withErrorHandling("comments.patch", async () => {
    const { id, commentId } = await params;
    const { body } = await req.json() as { body: string };

    if (!body?.trim()) return NextResponse.json({ error: "Body required" }, { status: 400 });

    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDB();
    const comment = await db
      .prepare("SELECT id, user_id FROM comments WHERE id = ? AND list_id = ?")
      .bind(commentId, id)
      .first<{ id: string; user_id: string | null }>();

    if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (comment.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const now = Date.now();
    await db
      .prepare("UPDATE comments SET body = ?, updated_at = ? WHERE id = ?")
      .bind(body.trim(), now, commentId)
      .run();

    return NextResponse.json({ body: body.trim(), updatedAt: now });
  });
}
