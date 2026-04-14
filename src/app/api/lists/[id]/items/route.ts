import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

export const runtime = "edge";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id } = await params;
    const db = await getDB();

    const list = await db
      .prepare("SELECT owner_id FROM lists WHERE id = ?")
      .bind(id)
      .first<{ owner_id: string }>();

    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (list.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, secondary, reason } = await req.json() as {
      name: string; secondary?: string; reason?: string;
    };

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const maxPos = await db
      .prepare("SELECT MAX(position) AS max_pos FROM items WHERE list_id = ?")
      .bind(id)
      .first<{ max_pos: number | null }>();

    const position = (maxPos?.max_pos ?? -1) + 1;
    const itemId = crypto.randomUUID();
    const now = Date.now();

    await db
      .prepare(
        `INSERT INTO items (id, list_id, name, secondary, reason, status, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'unseen', ?, ?, ?)`
      )
      .bind(itemId, id, name.trim(), secondary?.trim() || null, reason?.trim() || null, position, now, now)
      .run();

    await db.prepare("UPDATE lists SET updated_at = ? WHERE id = ?").bind(now, id).run();

    return NextResponse.json({ id: itemId }, { status: 201 });
  });
}
