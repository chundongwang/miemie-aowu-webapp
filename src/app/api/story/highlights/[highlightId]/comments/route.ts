import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import type { StoryHighlightComment } from "@/types";

type Params = { params: Promise<{ highlightId: string }> };

// POST /api/story/highlights/:highlightId/comments — reply on an existing highlight
export async function POST(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { highlightId } = await params;
    const { body } = (await req.json()) as { body: string };

    if (!body?.trim()) return NextResponse.json({ error: "Body required" }, { status: 400 });

    const db = await getDB();

    const hl = await db
      .prepare("SELECT id FROM story_highlights WHERE id = ?")
      .bind(highlightId)
      .first<{ id: string }>();
    if (!hl) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const user = await db
      .prepare("SELECT display_name FROM users WHERE id = ?")
      .bind(userId)
      .first<{ display_name: string }>();
    const authorName = user?.display_name ?? "Anonymous";

    const id = crypto.randomUUID();
    const now = Date.now();

    await db
      .prepare(
        `INSERT INTO story_highlight_comments (id, highlight_id, user_id, author_name, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, highlightId, userId, authorName, body.trim(), now)
      .run();

    const comment: StoryHighlightComment = {
      id,
      highlightId,
      userId,
      authorName,
      body: body.trim(),
      createdAt: now,
    };

    return NextResponse.json(comment, { status: 201 });
  });
}
