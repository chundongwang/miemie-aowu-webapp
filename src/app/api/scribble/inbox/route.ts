import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

export async function GET() {
  return withAuth(async (userId) => {
    const db = await getDB();

    const rows = await db
      .prepare(
        `SELECT s.id, s.word, s.sentence_en, s.sentence_zh, s.drawing_r2_key, s.created_at,
                u.display_name AS sender_name, u.username AS sender_username
         FROM scribbles s
         JOIN users u ON u.id = s.sender_id
         WHERE s.receiver_id = ?
         ORDER BY s.created_at DESC
         LIMIT 50`
      )
      .bind(userId)
      .all<{
        id: string;
        word: string;
        sentence_en: string;
        sentence_zh: string;
        drawing_r2_key: string;
        created_at: number;
        sender_name: string;
        sender_username: string;
      }>();

    const results = (rows.results ?? []).map((r) => ({
      id: r.id,
      word: r.word,
      sentenceEn: r.sentence_en,
      sentenceZh: r.sentence_zh,
      imageUrl: `/api/photos/${r.drawing_r2_key}`,
      createdAt: r.created_at,
      senderName: r.sender_name,
      senderUsername: r.sender_username,
    }));

    return NextResponse.json(results);
  });
}