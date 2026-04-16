import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { CATEGORIES } from "@/types";


export async function GET() {
  return withAuth(async (userId) => {
    const db = await getDB();
    const rows = await db
      .prepare(
        `SELECT l.*,
                o.username AS owner_username, o.display_name AS owner_display_name,
                r.username AS recipient_username, r.display_name AS recipient_display_name,
                COUNT(i.id) AS item_count
         FROM lists l
         JOIN users o ON o.id = l.owner_id
         LEFT JOIN users r ON r.id = l.recipient_id
         LEFT JOIN items i ON i.list_id = l.id
         WHERE l.owner_id = ? OR l.recipient_id = ?
         GROUP BY l.id
         ORDER BY l.updated_at DESC`
      )
      .bind(userId, userId)
      .all();

    return NextResponse.json(rows.results.map(mapList));
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (userId) => {
    const { title, emoji, category, secondaryLabel, isPublic } = await req.json() as {
      title: string; emoji: string; category: string; secondaryLabel?: string; isPublic?: boolean;
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const cat = CATEGORIES[category] ?? CATEGORIES.custom;
    const id = crypto.randomUUID();
    const now = Date.now();
    const db = await getDB();

    await db
      .prepare(
        `INSERT INTO lists (id, owner_id, title, emoji, category, secondary_label, is_public, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id, userId, title.trim(),
        emoji || cat.emoji,
        category || "custom",
        secondaryLabel ?? cat.secondaryLabel ?? null,
        isPublic === true ? 1 : 0,
        now, now
      )
      .run();

    return NextResponse.json({ id }, { status: 201 });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapList(r: any) {
  return {
    id: r.id,
    title: r.title,
    emoji: r.emoji,
    category: r.category,
    secondaryLabel: r.secondary_label,
    isPublic: r.is_public === 1,
    ownerId: r.owner_id,
    ownerUsername: r.owner_username,
    ownerDisplayName: r.owner_display_name,
    recipientId: r.recipient_id,
    recipientUsername: r.recipient_username,
    recipientDisplayName: r.recipient_display_name,
    itemCount: r.item_count,
    createdAt: r.created_at,
  };
}
