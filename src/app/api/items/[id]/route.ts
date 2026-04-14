import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";


type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id } = await params;
    const db = await getDB();

    const item = await db
      .prepare(
        `SELECT i.id, l.owner_id FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = ?`
      )
      .bind(id)
      .first<{ id: string; owner_id: string }>();

    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name, secondary, reason } = await req.json() as {
      name?: string; secondary?: string; reason?: string;
    };

    await db
      .prepare(
        `UPDATE items SET
           name = COALESCE(?, name),
           secondary = COALESCE(?, secondary),
           reason = COALESCE(?, reason),
           updated_at = ?
         WHERE id = ?`
      )
      .bind(name ?? null, secondary ?? null, reason ?? null, Date.now(), id)
      .run();

    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id } = await params;
    const db = await getDB();

    const item = await db
      .prepare(
        `SELECT i.id, l.owner_id FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = ?`
      )
      .bind(id)
      .first<{ id: string; owner_id: string }>();

    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await db.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
    return NextResponse.json({ ok: true });
  });
}
