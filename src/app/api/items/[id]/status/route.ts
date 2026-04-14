import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";


const VALID_STATUSES = ["unseen", "saved", "done"];
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id } = await params;
    const { status } = await req.json() as { status: string };

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const db = await getDB();

    const item = await db
      .prepare(
        `SELECT i.id, l.owner_id, l.recipient_id
         FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = ?`
      )
      .bind(id)
      .first<{ id: string; owner_id: string; recipient_id: string | null }>();

    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const canUpdate = item.owner_id === userId || item.recipient_id === userId;
    if (!canUpdate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await db
      .prepare("UPDATE items SET status = ?, updated_at = ? WHERE id = ?")
      .bind(status, Date.now(), id)
      .run();

    return NextResponse.json({ ok: true });
  });
}
