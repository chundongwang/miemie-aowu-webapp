import { NextRequest, NextResponse } from "next/server";
import { getDB, getPhotoBucket } from "@/lib/db";
import { getAuthUserId } from "@/lib/auth";
import { logError } from "@/lib/logger";


type Params = { params: Promise<{ id: string }> };

type ItemInput = {
  name: string;
  secondary?: string | null;
  reason?: string | null;
  imageUrls?: string[];
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const IMAGE_TIMEOUT_MS = 10_000;

async function downloadAndUpload(
  url: string,
  r2Key: string,
  bucket: R2Bucket,
): Promise<void> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    headers: { "User-Agent": "miemieaowu-bot/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error("Not an image");

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error("Image too large (>5 MB)");

  await bucket.put(r2Key, buf, { httpMetadata: { contentType } });
}

export async function POST(req: NextRequest, { params }: Params) {
  // Auth + ownership checks before opening the stream
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const bucket = await getPhotoBucket();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const maxPos = await db
          .prepare("SELECT MAX(position) AS max_pos FROM items WHERE list_id = ?")
          .bind(id)
          .first<{ max_pos: number | null }>();
        let nextPos = (maxPos?.max_pos ?? -1) + 1;
        const now = Date.now();

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const itemId = crypto.randomUUID();

          // Insert the item
          await db
            .prepare(
              `INSERT INTO items (id, list_id, name, secondary, reason, status, position, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'unseen', ?, ?, ?)`
            )
            .bind(
              itemId, id,
              item.name.trim(),
              item.secondary?.trim() || null,
              item.reason?.trim()    || null,
              nextPos++, now, now
            )
            .run();

          // Download + upload images in parallel; skip failures silently
          const urls = (item.imageUrls ?? []).slice(0, 3);
          if (urls.length > 0) {
            const photoIds = urls.map(() => crypto.randomUUID());
            const r2Keys   = photoIds.map((pid) => `${itemId}/${pid}`);

            const results = await Promise.allSettled(
              urls.map((url, idx) => downloadAndUpload(url, r2Keys[idx], bucket))
            );

            const photoInserts = results
              .map((r, idx) => ({ r, photoId: photoIds[idx], r2Key: r2Keys[idx] }))
              .filter(({ r }) => r.status === "fulfilled")
              .map(({ photoId, r2Key }, pos) =>
                db
                  .prepare("INSERT INTO item_photos (id, item_id, r2_key, position) VALUES (?, ?, ?, ?)")
                  .bind(photoId, itemId, r2Key, pos)
              );

            if (photoInserts.length > 0) {
              await db.batch(photoInserts);
            }

            // Log any image failures (non-fatal)
            results.forEach((r, idx) => {
              if (r.status === "rejected") {
                console.warn(`Image skip [${urls[idx]}]: ${r.reason}`);
              }
            });
          }

          send({ type: "item", index: i, total: items.length });
        }

        await db
          .prepare("UPDATE lists SET updated_at = ? WHERE id = ?")
          .bind(Date.now(), id)
          .run();

        send({ type: "done", count: items.length });
      } catch (err) {
        logError("bulk-import", err);
        send({ type: "error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no", // disable nginx buffering if present
    },
  });
}
