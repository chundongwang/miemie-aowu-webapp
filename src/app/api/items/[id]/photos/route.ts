import { NextRequest, NextResponse } from "next/server";
import { getDB, getPhotoBucket } from "@/lib/db";
import { withAuth } from "@/lib/api";


const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PHOTOS = 3;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id: itemId } = await params;
    const db = await getDB();

    // verify ownership
    const item = await db
      .prepare(
        `SELECT i.id, l.owner_id FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = ?`
      )
      .bind(itemId)
      .first<{ id: string; owner_id: string }>();

    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // check existing photo count
    const countRow = await db
      .prepare("SELECT COUNT(*) AS n FROM item_photos WHERE item_id = ?")
      .bind(itemId)
      .first<{ n: number }>();

    if ((countRow?.n ?? 0) >= MAX_PHOTOS) {
      return NextResponse.json({ error: `Max ${MAX_PHOTOS} photos per item` }, { status: 400 });
    }

    // parse multipart body
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File must be under 5 MB" }, { status: 400 });
    }

    const photoId = crypto.randomUUID();
    const r2Key = `${itemId}/${photoId}`;
    const bucket = await getPhotoBucket();

    await bucket.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });

    const position = (countRow?.n ?? 0);
    await db
      .prepare("INSERT INTO item_photos (id, item_id, r2_key, position) VALUES (?, ?, ?, ?)")
      .bind(photoId, itemId, r2Key, position)
      .run();

    return NextResponse.json(
      { id: photoId, url: `/api/photos/${r2Key}` },
      { status: 201 }
    );
  });
}
