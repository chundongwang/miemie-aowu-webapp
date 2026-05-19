import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth, withErrorHandling } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  return withErrorHandling("checkins.get", async () => {
    const { id: itemId } = await params;
    const db = await getDB();

    const item = await db.prepare("SELECT id FROM items WHERE id = ?").bind(itemId).first();
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rows = await db
      .prepare(
        `SELECT id, item_id, list_id, user_id, user_display_name,
                latitude, longitude, note, created_at
         FROM check_ins
         WHERE item_id = ?
         ORDER BY created_at DESC`
      )
      .bind(itemId)
      .all();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checkIns = rows.results.map((r: any) => ({
      id: r.id,
      itemId: r.item_id,
      listId: r.list_id,
      userId: r.user_id,
      userDisplayName: r.user_display_name,
      latitude: r.latitude,
      longitude: r.longitude,
      note: r.note,
      createdAt: r.created_at,
    }));

    return NextResponse.json(checkIns);
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id: itemId } = await params;
    const { latitude, longitude, note } = await req.json() as {
      latitude?: number;
      longitude?: number;
      note?: string;
    };

    const db = await getDB();

    // Verify item exists and get its list_id
    const item = await db
      .prepare("SELECT id, list_id FROM items WHERE id = ?")
      .bind(itemId)
      .first<{ id: string; list_id: string }>();
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Get user display name
    const user = await db
      .prepare("SELECT display_name, username FROM users WHERE id = ?")
      .bind(userId)
      .first<{ display_name: string | null; username: string }>();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const displayName = user.display_name || user.username;
    const id = crypto.randomUUID();
    const createdAt = Date.now();

    await db
      .prepare(
        `INSERT INTO check_ins (id, item_id, list_id, user_id, user_display_name, latitude, longitude, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        itemId,
        item.list_id,
        userId,
        displayName,
        latitude ?? null,
        longitude ?? null,
        note?.trim() || null,
        createdAt
      )
      .run();

    const count = await db
      .prepare("SELECT COUNT(*) AS cnt FROM check_ins WHERE item_id = ?")
      .bind(itemId)
      .first<{ cnt: number }>();

    return NextResponse.json({
      id,
      itemId,
      listId: item.list_id,
      userId,
      userDisplayName: displayName,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      note: note?.trim() || null,
      createdAt,
      checkInCount: count?.cnt ?? 1,
    });
  });
}
