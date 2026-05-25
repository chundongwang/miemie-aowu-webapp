import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

// Returns a random Chinese idiom (成语) for the player to draw.
export async function GET() {
  return withAuth(async () => {
    const db = await getDB();
    const row = await db
      .prepare(
        `SELECT id, idiom, pinyin, explanation
         FROM idioms
         ORDER BY RANDOM()
         LIMIT 1`
      )
      .first<{
        id: number;
        idiom: string;
        pinyin: string;
        explanation: string | null;
      }>();

    if (!row) {
      return NextResponse.json({ error: "No idioms available" }, { status: 500 });
    }

    return NextResponse.json({
      idiomId: row.id,
      idiom: row.idiom,
      pinyin: row.pinyin,
      explanation: row.explanation ?? "",
    });
  });
}
