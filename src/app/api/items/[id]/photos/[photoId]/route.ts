import { NextRequest, NextResponse } from "next/server";
import { getDB, getPhotoBucket } from "@/lib/db";
import { withAuth } from "@/lib/api";


type Params = { params: Promise<{ id: string; photoId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id: itemId, photoId } = await params;
    const db = await getDB();

    const photo = await db
      .prepare(
        `SELECT p.id, p.r2_key, l.owner_id, l.recipient_id
         FROM item_photos p
         JOIN items i ON i.id = p.item_id
         JOIN lists l ON l.id = i.list_id
         WHERE p.id = ? AND p.item_id = ?`
      )
      .bind(photoId, itemId)
      .first<{ id: string; r2_key: string; owner_id: string; recipient_id: string | null }>();

    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (photo.owner_id !== userId && photo.recipient_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const bucket = await getPhotoBucket();
    await bucket.delete(photo.r2_key);
    await db.prepare("DELETE FROM item_photos WHERE id = ?").bind(photoId).run();

    return NextResponse.json({ ok: true });
  });
}
