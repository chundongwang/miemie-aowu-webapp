import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id } = await params;
    const { order } = await req.json() as { order: string[] };

    if (!Array.isArray(order) || order.length === 0) {
      return NextResponse.json({ error: "order required" }, { status: 400 });
    }

    const db = await getDB();

    const list = await db
      .prepare("SELECT owner_id, recipient_id FROM lists WHERE id = ?")
      .bind(id)
      .first<{ owner_id: string; recipient_id: string | null }>();

    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (list.owner_id !== userId && list.recipient_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = Date.now();

    // Assign staggered updated_at so manual order is expressed through the
    // existing updated_at DESC sort (item[0] = now, item[1] = now-1ms, ...).
    for (let i = 0; i < order.length; i++) {
      await db
        .prepare("UPDATE items SET position = ?, updated_at = ? WHERE id = ? AND list_id = ?")
        .bind(i, now - i, order[i], id)
        .run();
    }

    // Bump list updated_at to trigger blue badge for the other user
    await db.prepare("UPDATE lists SET updated_at = ? WHERE id = ?").bind(now, id).run();

    // Mark as viewed for the person who reordered so they don't see their own badge
    await db
      .prepare(
        "INSERT INTO list_views (user_id, list_id, viewed_at) VALUES (?, ?, ?) ON CONFLICT (user_id, list_id) DO UPDATE SET viewed_at = excluded.viewed_at"
      )
      .bind(userId, id, now)
      .run();

    return NextResponse.json({ ok: true });
  });
}
