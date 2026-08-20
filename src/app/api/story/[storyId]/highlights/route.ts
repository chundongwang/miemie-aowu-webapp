import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import type { StoryHighlight, StoryHighlightComment } from "@/types";

type Params = { params: Promise<{ storyId: string }> };

// GET /api/story/:storyId/highlights — all highlights + their comment threads
export async function GET(_req: NextRequest, { params }: Params) {
  return withAuth(async () => {
    const { storyId } = await params;
    const db = await getDB();

    const hlRows = await db
      .prepare(
        `SELECT id, story_id, para_index, start_offset, end_offset, quote,
                user_id, author_name, created_at
         FROM story_highlights WHERE story_id = ?
         ORDER BY para_index ASC, start_offset ASC`
      )
      .bind(storyId)
      .all();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highlights: StoryHighlight[] = (hlRows.results as any[]).map((r) => ({
      id: r.id,
      storyId: r.story_id,
      paraIndex: r.para_index,
      startOffset: r.start_offset,
      endOffset: r.end_offset,
      quote: r.quote,
      userId: r.user_id ?? null,
      authorName: r.author_name,
      createdAt: r.created_at,
      comments: [],
    }));

    if (highlights.length > 0) {
      const cRows = await db
        .prepare(
          `SELECT c.id, c.highlight_id, c.user_id, c.author_name, c.body, c.created_at
           FROM story_highlight_comments c
           JOIN story_highlights h ON h.id = c.highlight_id
           WHERE h.story_id = ?
           ORDER BY c.created_at ASC`
        )
        .bind(storyId)
        .all();

      const byHl = new Map<string, StoryHighlightComment[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of cRows.results as any[]) {
        const c: StoryHighlightComment = {
          id: r.id,
          highlightId: r.highlight_id,
          userId: r.user_id ?? null,
          authorName: r.author_name,
          body: r.body,
          createdAt: r.created_at,
        };
        const arr = byHl.get(c.highlightId) ?? [];
        arr.push(c);
        byHl.set(c.highlightId, arr);
      }
      for (const h of highlights) h.comments = byHl.get(h.id) ?? [];
    }

    return NextResponse.json(highlights);
  });
}

// POST /api/story/:storyId/highlights — create a highlight + its first note
export async function POST(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { storyId } = await params;
    const { paraIndex, startOffset, endOffset, quote, body } = (await req.json()) as {
      paraIndex: number;
      startOffset: number;
      endOffset: number;
      quote: string;
      body?: string;
    };

    if (
      typeof paraIndex !== "number" ||
      typeof startOffset !== "number" ||
      typeof endOffset !== "number" ||
      endOffset <= startOffset ||
      !quote?.trim()
    ) {
      return NextResponse.json({ error: "Invalid highlight" }, { status: 400 });
    }

    const db = await getDB();

    const user = await db
      .prepare("SELECT display_name FROM users WHERE id = ?")
      .bind(userId)
      .first<{ display_name: string }>();
    const authorName = user?.display_name ?? "Anonymous";

    const id = crypto.randomUUID();
    const now = Date.now();

    await db
      .prepare(
        `INSERT INTO story_highlights
           (id, story_id, para_index, start_offset, end_offset, quote, user_id, author_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, storyId, paraIndex, startOffset, endOffset, quote.trim(), userId, authorName, now)
      .run();

    const comments: StoryHighlightComment[] = [];
    if (body?.trim()) {
      const commentId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO story_highlight_comments (id, highlight_id, user_id, author_name, body, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(commentId, id, userId, authorName, body.trim(), now)
        .run();
      comments.push({
        id: commentId,
        highlightId: id,
        userId,
        authorName,
        body: body.trim(),
        createdAt: now,
      });
    }

    const highlight: StoryHighlight = {
      id,
      storyId,
      paraIndex,
      startOffset,
      endOffset,
      quote: quote.trim(),
      userId,
      authorName,
      createdAt: now,
      comments,
    };

    return NextResponse.json(highlight, { status: 201 });
  });
}
