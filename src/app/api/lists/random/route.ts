import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";


export async function GET() {
  const db = await getDB();
  const rows = await db
    .prepare(
      `SELECT l.id, l.title, l.emoji, l.category,
              o.username AS owner_username, o.display_name AS owner_display_name,
              COUNT(i.id) AS item_count
       FROM lists l
       JOIN users o ON o.id = l.owner_id
       LEFT JOIN items i ON i.list_id = l.id
       WHERE l.is_public = 1
       GROUP BY l.id
       ORDER BY RANDOM()
       LIMIT 12`
    )
    .all();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json(rows.results.map((r: any) => ({
    id: r.id,
    title: r.title,
    emoji: r.emoji,
    category: r.category,
    ownerUsername: r.owner_username,
    ownerDisplayName: r.owner_display_name,
    itemCount: r.item_count,
  })));
}
