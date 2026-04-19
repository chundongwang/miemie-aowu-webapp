import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { getAuthUserId } from "@/lib/auth";


type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await getAuthUserId();
  const db = await getDB();

  const list = await db
    .prepare(
      `SELECT l.*,
              o.username AS owner_username, o.display_name AS owner_display_name,
              r.username AS recipient_username, r.display_name AS recipient_display_name
       FROM lists l
       JOIN users o ON o.id = l.owner_id
       LEFT JOIN users r ON r.id = l.recipient_id
       WHERE l.id = ? AND (l.is_public = 1 OR l.owner_id = ? OR l.recipient_id = ?)`
    )
    .bind(id, userId ?? "", userId ?? "")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .first<any>();

  if (!list) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  {

    const itemRows = await db
      .prepare(
        `SELECT i.*, GROUP_CONCAT(p.id || '|' || p.r2_key || '|' || p.position) AS photos_raw
         FROM items i
         LEFT JOIN item_photos p ON p.item_id = i.id
         WHERE i.list_id = ?
         GROUP BY i.id
         ORDER BY i.updated_at DESC`
      )
      .bind(id)
      .all();

    // Fetch reaction counts (graceful fallback if table not yet migrated)
    const reactionMap = new Map<string, { miemie: number; aowu: number }>();
    try {
      const reactionRows = await db
        .prepare(
          `SELECT item_id,
                  SUM(CASE WHEN type='miemie' THEN 1 ELSE 0 END) AS miemie_count,
                  SUM(CASE WHEN type='aowu'   THEN 1 ELSE 0 END) AS aowu_count
           FROM reactions
           WHERE item_id IN (SELECT id FROM items WHERE list_id = ?)
           GROUP BY item_id`
        )
        .bind(id)
        .all();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of reactionRows.results as any[]) {
        reactionMap.set(r.item_id, { miemie: r.miemie_count ?? 0, aowu: r.aowu_count ?? 0 });
      }
    } catch {
      // reactions table not yet created — treat as zero counts
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = itemRows.results.map((r: any) => ({
      id: r.id,
      listId: r.list_id,
      name: r.name,
      secondary: r.secondary,
      reason: r.reason,
      status: r.status,
      position: r.position,
      miemieCount: reactionMap.get(r.id)?.miemie ?? 0,
      aowuCount:   reactionMap.get(r.id)?.aowu   ?? 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      photos: r.photos_raw
        ? r.photos_raw.split(",").map((chunk: string) => {
            const [photoId, r2Key, pos] = chunk.split("|");
            return { id: photoId, r2Key, position: Number(pos), url: `/api/photos/${r2Key}` };
          })
        : [],
    }));

    // Record view for authenticated users
    if (userId) {
      await db.prepare(
        `INSERT INTO list_views (user_id, list_id, viewed_at) VALUES (?, ?, ?)
         ON CONFLICT (user_id, list_id) DO UPDATE SET viewed_at = excluded.viewed_at`
      ).bind(userId, id, Date.now()).run();
    }

    return NextResponse.json({
      id: list.id,
      title: list.title,
      emoji: list.emoji,
      category: list.category,
      secondaryLabel: list.secondary_label,
      isPublic: list.is_public === 1,
      ownerId: list.owner_id,
      ownerUsername: list.owner_username,
      ownerDisplayName: list.owner_display_name,
      recipientId: list.recipient_id,
      recipientUsername: list.recipient_username,
      recipientDisplayName: list.recipient_display_name,
      createdAt: list.created_at,
      updatedAt: list.updated_at,
      hasUnread: false,
      itemCount: items.length,
      items,
    });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id } = await params;
    const db = await getDB();

    const list = await db
      .prepare("SELECT owner_id FROM lists WHERE id = ?")
      .bind(id)
      .first<{ owner_id: string }>();

    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (list.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { title, emoji, secondaryLabel, isPublic } = await req.json() as {
      title?: string; emoji?: string; secondaryLabel?: string; isPublic?: boolean;
    };

    const sets: string[] = [];
    const binds: unknown[] = [];
    if (title?.trim())          { sets.push("title = ?");          binds.push(title.trim()); }
    if (emoji)                  { sets.push("emoji = ?");          binds.push(emoji); }
    if (secondaryLabel !== undefined) { sets.push("secondary_label = ?"); binds.push(secondaryLabel || null); }
    if (isPublic !== undefined) { sets.push("is_public = ?");      binds.push(isPublic ? 1 : 0); }
    if (sets.length === 0)      return NextResponse.json({ ok: true });

    sets.push("updated_at = ?");
    binds.push(Date.now(), id);

    await db.prepare(`UPDATE lists SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();

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

    await db.prepare("DELETE FROM lists WHERE id = ?").bind(id).run();
    return NextResponse.json({ ok: true });
  });
}
