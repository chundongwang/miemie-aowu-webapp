import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

export async function GET() {
  return withAuth(async (userId) => {
    const db = await getDB();

    // Only idiom-flavoured scribbles (idiom_id IS NOT NULL); legacy IELTS
    // rows are no longer shown. JOIN to fetch pinyin/explanation lazily.
    const rows = await db
      .prepare(
        `SELECT s.id, s.word AS idiom, i.pinyin, i.explanation,
                s.drawing_r2_key, s.created_at, s.viewed_at,
                s.guess_text, s.guess_grade, s.guessed_at,
                u.display_name AS sender_name, u.username AS sender_username
         FROM scribbles s
         JOIN users  u ON u.id = s.sender_id
         JOIN idioms i ON i.id = s.idiom_id
         WHERE s.receiver_id = ?
         ORDER BY s.created_at DESC
         LIMIT 50`
      )
      .bind(userId)
      .all<{
        id: string;
        idiom: string;
        pinyin: string;
        explanation: string | null;
        drawing_r2_key: string;
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
      return {
        id: r.id,
        // Hide the answer until the receiver has guessed.
        idiom: guessed ? r.idiom : null,
        pinyin: guessed ? r.pinyin : null,
        explanation: guessed ? r.explanation : null,
        imageUrl: `/api/photos/${r.drawing_r2_key}`,
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
