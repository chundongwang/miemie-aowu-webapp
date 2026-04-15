import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";


type Params = { params: Promise<{ id: string }> };

type ItemInput = { name: string; secondary?: string | null; reason?: string | null };

export async function POST(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id } = await params;
    const { items } = await req.json() as { items: ItemInput[] };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Items required" }, { status: 400 });
    }
    if (items.length > 50) {
      return NextResponse.json({ error: "Max 50 items per import" }, { status: 400 });
    }

    const db = await getDB();

    const list = await db
      .prepare("SELECT owner_id FROM lists WHERE id = ?")
      .bind(id)
      .first<{ owner_id: string }>();

    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (list.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const maxPos = await db
      .prepare("SELECT MAX(position) AS max_pos FROM items WHERE list_id = ?")
      .bind(id)
      .first<{ max_pos: number | null }>();
    const startPos = (maxPos?.max_pos ?? -1) + 1;
    const now = Date.now();

    const stmts = items.map((item, idx) =>
      db
        .prepare(
          `INSERT INTO items (id, list_id, name, secondary, reason, status, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'unseen', ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(), id,
          item.name.trim(),
          item.secondary?.trim() || null,
          item.reason?.trim()    || null,
          startPos + idx, now, now
        )
    );

    await db.batch(stmts);
    await db.prepare("UPDATE lists SET updated_at = ? WHERE id = ?").bind(now, id).run();

    return NextResponse.json({ count: items.length });
  });
}
