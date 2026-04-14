import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

export const runtime = "edge";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id } = await params;
    const { order } = await req.json() as { order: string[] };

    if (!Array.isArray(order) || order.length === 0) {
      return NextResponse.json({ error: "order must be a non-empty array of item IDs" }, { status: 400 });
    }

    const db = await getDB();

    const list = await db
      .prepare("SELECT owner_id FROM lists WHERE id = ?")
      .bind(id)
      .first<{ owner_id: string }>();

    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (list.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const now = Date.now();
    await db.batch(
      order.map((itemId, pos) =>
        db
          .prepare("UPDATE items SET position = ?, updated_at = ? WHERE id = ? AND list_id = ?")
          .bind(pos, now, itemId, id)
      )
    );

    return NextResponse.json({ ok: true });
  });
}
