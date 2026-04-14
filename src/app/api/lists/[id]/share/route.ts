import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";


type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id } = await params;
    const { username } = await req.json() as { username: string };
    if (!username) return NextResponse.json({ error: "Username is required" }, { status: 400 });

    const db = await getDB();

    const list = await db
      .prepare("SELECT owner_id FROM lists WHERE id = ?")
      .bind(id)
      .first<{ owner_id: string }>();

    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (list.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const recipient = await db
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username.toLowerCase())
      .first<{ id: string }>();

    if (!recipient) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (recipient.id === userId) {
      return NextResponse.json({ error: "Cannot share with yourself" }, { status: 400 });
    }

    await db
      .prepare("UPDATE lists SET recipient_id = ?, updated_at = ? WHERE id = ?")
      .bind(recipient.id, Date.now(), id)
      .run();

    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id } = await params;
    const db = await getDB();

    const list = await db
      .prepare("SELECT owner_id FROM lists WHERE id = ?")
      .bind(id)
      .first<{ owner_id: string }>();

    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (list.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await db
      .prepare("UPDATE lists SET recipient_id = NULL, updated_at = ? WHERE id = ?")
      .bind(Date.now(), id)
      .run();

    return NextResponse.json({ ok: true });
  });
}
