import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

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
                s.guess_text, s.guess_grade, s.guessed_at,
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
        sender_name: string;
        sender_username: string;
      }>();

    const results = (rows.results ?? []).map((r) => {
      const guessed = r.guess_grade !== null;
      const isPrompt = r.prompt_id !== null;
      return {
        id: r.id,
        // For prompt-based: category is always visible, guesser clue is sent
        // up-front and the client decides when to reveal it (mid-replay).
        // The word + drawer description are hidden until guessed.
        kind: (isPrompt ? "prompt" : "idiom") as "prompt" | "idiom",
        category: r.p_category,
        guesserClue: isPrompt ? r.p_guesser_clue : null,
        word: guessed ? r.answer : null,
        drawerDescription: guessed ? r.p_drawer_desc : null,
        // Legacy idiom fields (only populated for idiom scribbles).
        pinyin: guessed && !isPrompt ? r.i_pinyin : null,
        explanation: guessed && !isPrompt ? r.i_explanation : null,
        imageUrl: `/api/photos/${r.drawing_r2_key}`,
        recordingUrl: r.recording_r2_key ? `/api/photos/${r.recording_r2_key}` : null,
        createdAt: r.created_at,
        viewedAt: r.viewed_at,
        guess: r.guess_text,
        guessGrade: r.guess_grade as "exact" | "similar" | "wrong" | "revealed" | null,
        guessedAt: r.guessed_at,
        senderName: r.sender_name,
        senderUsername: r.sender_username,
      };
    });

    return NextResponse.json(results);
  });
}
