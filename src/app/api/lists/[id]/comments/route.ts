import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getAuthUserId } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api";


type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  return withErrorHandling("comments.get", async () => {
    const { id } = await params;
    const userId = await getAuthUserId();
    const db = await getDB();

    const list = await db
      .prepare("SELECT id, is_public, owner_id, recipient_id FROM lists WHERE id = ?")
      .bind(id)
      .first<{ id: string; is_public: number; owner_id: string; recipient_id: string | null }>();

    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!list.is_public && list.owner_id !== userId && list.recipient_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await db
      .prepare(
        `SELECT c.id, c.list_id, c.item_id, c.author_name, c.body, c.created_at,
                i.name AS item_name
         FROM comments c
         LEFT JOIN items i ON i.id = c.item_id
         WHERE c.list_id = ?
         ORDER BY c.created_at ASC`
      )
      .bind(id)
      .all();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json(rows.results.map((r: any) => ({
      id: r.id,
      listId: r.list_id,
      itemId: r.item_id ?? null,
      itemName: r.item_name ?? null,
      authorName: r.author_name,
      body: r.body,
      createdAt: r.created_at,
    })));
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  return withErrorHandling("comments.post", async () => {
    const { id } = await params;
    const { body, authorName, itemId } = await req.json() as {
      body: string; authorName?: string; itemId?: string;
    };

    if (!body?.trim()) return NextResponse.json({ error: "Body required" }, { status: 400 });

    const userId = await getAuthUserId();
    const db = await getDB();

    const list = await db
      .prepare("SELECT id, is_public, owner_id, recipient_id FROM lists WHERE id = ?")
      .bind(id)
      .first<{ id: string; is_public: number; owner_id: string; recipient_id: string | null }>();

    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!list.is_public && list.owner_id !== userId && list.recipient_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let name = authorName?.trim() || "Anonymous";
    if (userId) {
      const user = await db
        .prepare("SELECT display_name FROM users WHERE id = ?")
        .bind(userId)
        .first<{ display_name: string }>();
      if (user) name = user.display_name;
    }

    const commentId = crypto.randomUUID();
    const now = Date.now();

    await db
      .prepare(
        "INSERT INTO comments (id, list_id, item_id, user_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(commentId, id, itemId ?? null, userId ?? null, name, body.trim(), now)
      .run();
    await db.prepare("UPDATE lists SET updated_at = ? WHERE id = ?").bind(now, id).run();
    if (itemId) {
      await db.prepare("UPDATE items SET updated_at = ? WHERE id = ?").bind(now, itemId).run();
    }
    if (userId) {
      await db.prepare(
        `INSERT INTO list_views (user_id, list_id, viewed_at) VALUES (?, ?, ?)
         ON CONFLICT (user_id, list_id) DO UPDATE SET viewed_at = excluded.viewed_at`
      ).bind(userId, id, now).run();
    }

    // Get item name for response
    let itemName: string | null = null;
    if (itemId) {
      const item = await db.prepare("SELECT name FROM items WHERE id = ?").bind(itemId).first<{ name: string }>();
      itemName = item?.name ?? null;
    }

    return NextResponse.json({
      id: commentId,
      listId: id,
      itemId: itemId ?? null,
      itemName,
      authorName: name,
      body: body.trim(),
      createdAt: now,
    }, { status: 201 });
  });
}
