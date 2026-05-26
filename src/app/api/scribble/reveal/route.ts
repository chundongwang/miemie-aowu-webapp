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
        `SELECT s.id, s.word AS answer, s.prompt_id, s.idiom_id, s.guess_grade,
                p.drawer_description AS p_drawer_desc,
                i.pinyin AS i_pinyin, i.explanation AS i_explanation
         FROM scribbles s
         LEFT JOIN scribble_prompts p ON p.id = s.prompt_id
         LEFT JOIN idioms i ON i.id = s.idiom_id
         WHERE s.id = ? AND s.receiver_id = ?
         LIMIT 1`
      )
      .bind(id, userId)
      .first<{
        id: string;
        answer: string;
        prompt_id: string | null;
        idiom_id: number | null;
        guess_grade: string | null;
        p_drawer_desc: string | null;
        i_pinyin: string | null;
        i_explanation: string | null;
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
      word: row.answer,
      drawerDescription: row.p_drawer_desc ?? "",
      // Legacy idiom fields populated for legacy scribbles only.
      pinyin: row.i_pinyin ?? "",
      explanation: row.i_explanation ?? "",
      guessedAt: now,
    });
  });
}
