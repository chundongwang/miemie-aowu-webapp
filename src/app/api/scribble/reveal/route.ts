import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

// Marks a scribble as "revealed" — the receiver gave up without guessing.
// Removes it from the active inbox queue and exposes the idiom/拼音/释义.
export async function POST(req: NextRequest) {
  return withAuth(async (userId) => {
    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    const id = body?.id?.trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const db = await getDB();
    const row = await db
      .prepare(
        `SELECT s.id, s.word AS idiom, i.pinyin, i.explanation, s.guess_grade
         FROM scribbles s
         JOIN idioms i ON i.id = s.idiom_id
         WHERE s.id = ? AND s.receiver_id = ?
         LIMIT 1`
      )
      .bind(id, userId)
      .first<{
        id: string;
        idiom: string;
        pinyin: string;
        explanation: string | null;
        guess_grade: string | null;
      }>();

    if (!row) return NextResponse.json({ error: "Scribble not found" }, { status: 404 });
    if (row.guess_grade) {
      return NextResponse.json({ error: "Already resolved" }, { status: 400 });
    }

    const now = Date.now();
    await db
      .prepare(
        `UPDATE scribbles
         SET guess_text = NULL, guess_grade = 'revealed', guessed_at = ?
         WHERE id = ? AND receiver_id = ?`
      )
      .bind(now, id, userId)
      .run();

    return NextResponse.json({
      grade: "revealed",
      idiom: row.idiom,
      pinyin: row.pinyin,
      explanation: row.explanation ?? "",
      guessedAt: now,
    });
  });
}
