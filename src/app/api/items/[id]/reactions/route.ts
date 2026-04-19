import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getAuthUserId } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api";


type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  return withErrorHandling("reactions.post", async () => {
    const { id: itemId } = await params;
    const { type } = await req.json() as { type: string };

    if (!["miemie", "aowu"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const userId = await getAuthUserId();
    const db = await getDB();

    const item = await db
      .prepare("SELECT id, list_id FROM items WHERE id = ?")
      .bind(itemId)
      .first<{ id: string; list_id: string }>();
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = Date.now();
    await db
      .prepare("INSERT INTO reactions (id, item_id, user_id, type, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), itemId, userId ?? null, type, now)
      .run();
    await db.prepare("UPDATE items SET updated_at = ? WHERE id = ?").bind(now, itemId).run();
    await db.prepare("UPDATE lists SET updated_at = ? WHERE id = ?").bind(now, item.list_id).run();

    const counts = await db
      .prepare(
        `SELECT SUM(CASE WHEN type='miemie' THEN 1 ELSE 0 END) AS miemie_count,
                SUM(CASE WHEN type='aowu'   THEN 1 ELSE 0 END) AS aowu_count
         FROM reactions WHERE item_id = ?`
      )
      .bind(itemId)
      .first<{ miemie_count: number; aowu_count: number }>();

    return NextResponse.json({
      miemieCount: counts?.miemie_count ?? 0,
      aowuCount:   counts?.aowu_count   ?? 0,
    });
  });
}
