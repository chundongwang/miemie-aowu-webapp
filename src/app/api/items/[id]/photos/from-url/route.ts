import { NextRequest, NextResponse } from "next/server";
import { getDB, getPhotoBucket } from "@/lib/db";
import { withAuth } from "@/lib/api";


const MAX_BYTES    = 5 * 1024 * 1024;
const TIMEOUT_MS   = 10_000;
type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id: itemId } = await params;
    const { url } = await req.json() as { url: string };

    if (!url?.startsWith("http")) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const db = await getDB();

    const item = await db
      .prepare(`SELECT i.id, l.owner_id, l.recipient_id FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = ?`)
      .bind(itemId)
      .first<{ id: string; owner_id: string; recipient_id: string | null }>();

    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.owner_id !== userId && item.recipient_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const countRow = await db
      .prepare("SELECT COUNT(*) AS n FROM item_photos WHERE item_id = ?")
      .bind(itemId)
      .first<{ n: number }>();
    if ((countRow?.n ?? 0) >= 3) {
      return NextResponse.json({ error: "Max 3 photos per item" }, { status: 400 });
    }

    // Download
    const imgRes = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "miemieaowu-bot/1.0" },
    });
    if (!imgRes.ok) {
      return NextResponse.json({ error: `Download failed: HTTP ${imgRes.status}` }, { status: 502 });
    }
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "URL is not an image" }, { status: 400 });
    }
    const buf = await imgRes.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image exceeds 5 MB" }, { status: 400 });
    }

    // Upload to R2
    const photoId = crypto.randomUUID();
    const r2Key   = `${itemId}/${photoId}`;
    const bucket  = await getPhotoBucket();
    await bucket.put(r2Key, buf, { httpMetadata: { contentType } });

    await db
      .prepare("INSERT INTO item_photos (id, item_id, r2_key, position) VALUES (?, ?, ?, ?)")
      .bind(photoId, itemId, r2Key, countRow?.n ?? 0)
      .run();

    return NextResponse.json({ id: photoId, url: `/api/photos/${r2Key}` }, { status: 201 });
  });
}
