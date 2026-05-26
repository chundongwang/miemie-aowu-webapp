import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { GUESS_TIMER_MS, type Grade } from "@/lib/scribbleGrade";

export async function GET() {
  return withAuth(async (userId) => {
    const db = await getDB();

    // Surface both prompt-based (new) and idiom-based (legacy) scribbles.
    // LEFT JOINs let either side be NULL. Legacy IELTS scribbles (no idiom_id
    // and no prompt_id) are filtered out.
    const rows = await db
      .prepare(
        `SELECT s.id, s.word AS answer,
                s.prompt_id,
                p.category    AS p_category,
                p.drawer_description AS p_drawer_desc,
                p.guesser_clue AS p_guesser_clue,
                s.idiom_id,
                i.pinyin AS i_pinyin, i.explanation AS i_explanation,
                s.drawing_r2_key, s.recording_r2_key,
                s.created_at, s.viewed_at,
                s.guess_text, s.guess_grade, s.guessed_at, s.final_grade,
                u.display_name AS sender_name, u.username AS sender_username
         FROM scribbles s
         JOIN users u ON u.id = s.sender_id
         LEFT JOIN scribble_prompts p ON p.id = s.prompt_id
         LEFT JOIN idioms i ON i.id = s.idiom_id
         WHERE s.receiver_id = ?
           AND (s.prompt_id IS NOT NULL OR s.idiom_id IS NOT NULL)
         ORDER BY s.created_at DESC
         LIMIT 50`
      )
      .bind(userId)
      .all<{
        id: string;
        answer: string;
        prompt_id: string | null;
        p_category: string | null;
        p_drawer_desc: string | null;
        p_guesser_clue: string | null;
        idiom_id: number | null;
        i_pinyin: string | null;
        i_explanation: string | null;
        drawing_r2_key: string;
        recording_r2_key: string | null;
        created_at: number;
        viewed_at: number | null;
        guess_text: string | null;
        guess_grade: string | null;
        guessed_at: number | null;
        final_grade: string | null;
        sender_name: string;
        sender_username: string;
      }>();

    const scribbles = rows.results ?? [];
    const ids = scribbles.map((r) => r.id);

    // Fetch all guess history rows for the surfaced scribbles in one query.
    // SQLite caps placeholders at 100 but our LIMIT 50 keeps us safely below.
    let guessesByScribble = new Map<string, Array<{
      id: string;
      scribble_id: string;
      guess_text: string;
      closeness: number | null;
      grade: Grade | null;
      time_used_ms: number;
      created_at: number;
    }>>();
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      const guessRows = await db
        .prepare(
          `SELECT id, scribble_id, guess_text, closeness, grade, time_used_ms, created_at
           FROM scribble_guesses
           WHERE scribble_id IN (${placeholders})
           ORDER BY created_at ASC`
        )
        .bind(...ids)
        .all<{
          id: string;
          scribble_id: string;
          guess_text: string;
          closeness: number | null;
          grade: Grade | null;
          time_used_ms: number;
          created_at: number;
        }>();
      guessesByScribble = (guessRows.results ?? []).reduce((acc, g) => {
        const list = acc.get(g.scribble_id);
        if (list) list.push(g); else acc.set(g.scribble_id, [g]);
        return acc;
      }, new Map<string, typeof guessRows.results extends (infer U)[] ? U[] : never>());
    }

    const now = Date.now();
    const GRADE_RANK: Record<Grade, number> = { S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 };

    const results = scribbles.map((r) => {
      const isPrompt = r.prompt_id !== null;
      const persistedFinalGrade = r.final_grade as Grade | null;
      // Legacy rows graded under the old 3-tier scheme have a guess_grade
      // but no final_grade. We surface their state via guessGrade as before.
      const legacyGuessGrade = r.guess_grade as "exact" | "similar" | "wrong" | "revealed" | null;
      const guesses = guessesByScribble.get(r.id) ?? [];

      // If the persisted final_grade is null but the guess timer has run out,
      // synthesize one from the best grade across the history (or F if no
      // guesses landed). The DB will get fixed up on the next interaction;
      // we don't write here to keep inbox reads cheap.
      let finalGrade: Grade | null = persistedFinalGrade;
      const timerExpired =
        r.viewed_at != null && now - r.viewed_at > GUESS_TIMER_MS;
      if (finalGrade === null && timerExpired) {
        let best: Grade | null = null;
        for (const g of guesses) {
          if (!g.grade) continue;
          if (best === null || GRADE_RANK[g.grade] > GRADE_RANK[best]) best = g.grade;
        }
        finalGrade = best ?? "F";
      }

      // Game-over iff we have a final letter grade OR (legacy path) a
      // resolved guess_grade.
      const finished = finalGrade !== null || legacyGuessGrade !== null;

      // For the new flow, the answer is revealed when the game is over; for
      // legacy rows, when guess_grade is set.
      const revealAnswer = finished;

      // Compute remaining guess time (server is the source of truth).
      const elapsed = r.viewed_at != null ? Math.max(0, now - r.viewed_at) : 0;
      const remainingMs = r.viewed_at != null
        ? Math.max(0, GUESS_TIMER_MS - elapsed)
        : GUESS_TIMER_MS;

      return {
        id: r.id,
        kind: (isPrompt ? "prompt" : "idiom") as "prompt" | "idiom",
        category: r.p_category,
        guesserClue: isPrompt ? r.p_guesser_clue : null,
        word: revealAnswer ? r.answer : null,
        drawerDescription: revealAnswer ? r.p_drawer_desc : null,
        // Legacy idiom fields (only populated for idiom scribbles after reveal).
        pinyin: revealAnswer && !isPrompt ? r.i_pinyin : null,
        explanation: revealAnswer && !isPrompt ? r.i_explanation : null,
        imageUrl: `/api/photos/${r.drawing_r2_key}`,
        recordingUrl: r.recording_r2_key ? `/api/photos/${r.recording_r2_key}` : null,
        createdAt: r.created_at,
        viewedAt: r.viewed_at,
        guess: r.guess_text,
        guessGrade: legacyGuessGrade,
        guessedAt: r.guessed_at,
        // New scoring fields:
        finalGrade,
        finished,
        timerMs: GUESS_TIMER_MS,
        remainingMs,
        guesses: guesses.map((g) => ({
          id: g.id,
          text: g.guess_text,
          closeness: g.closeness,
          grade: g.grade,
          timeUsedMs: g.time_used_ms,
          createdAt: g.created_at,
        })),
        senderName: r.sender_name,
        senderUsername: r.sender_username,
      };
    });

    return NextResponse.json(results);
  });
}
