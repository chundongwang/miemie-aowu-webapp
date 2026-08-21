import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import type { StoryRead } from "@/types";

type Params = { params: Promise<{ storyId: string }> };

// GET /api/story/:storyId/reads — who has opened the story, when, and how far
export async function GET(_req: NextRequest, { params }: Params) {
  return withAuth(async () => {
    const { storyId } = await params;
    const db = await getDB();

    const rows = await db
      .prepare(
        `SELECT r.user_id, u.display_name, r.progress, r.first_read_at, r.last_read_at
         FROM story_reads r
         JOIN users u ON u.id = r.user_id
         WHERE r.story_id = ? AND u.deleted_at IS NULL
         ORDER BY r.last_read_at DESC`
      )
      .bind(storyId)
      .all();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reads: StoryRead[] = (rows.results as any[]).map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      progress: r.progress,
      firstReadAt: r.first_read_at,
      lastReadAt: r.last_read_at,
    }));

    return NextResponse.json(reads);
  });
}

// POST /api/story/:storyId/reads — record/refresh the current user's receipt.
// Upsert: bump last_read_at, keep the furthest progress ever reached.
export async function POST(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { storyId } = await params;
    const { progress } = (await req.json().catch(() => ({}))) as { progress?: number };

    const p = Math.max(0, Math.min(1, typeof progress === "number" && isFinite(progress) ? progress : 0));
    const db = await getDB();
    const now = Date.now();

    await db
      .prepare(
        `INSERT INTO story_reads (user_id, story_id, progress, first_read_at, last_read_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, story_id) DO UPDATE SET
           last_read_at = excluded.last_read_at,
           progress = MAX(story_reads.progress, excluded.progress)`
      )
      .bind(userId, storyId, p, now, now)
      .run();

    return NextResponse.json({ ok: true });
  });
}
