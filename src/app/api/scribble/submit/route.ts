import { NextRequest, NextResponse } from "next/server";
import { getDB, getPhotoBucket } from "@/lib/db";
import { withAuth } from "@/lib/api";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(req: NextRequest) {
  return withAuth(async (userId) => {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File must be under 15 MB" }, { status: 400 });
    }

    const word = (formData.get("word") as string)?.trim();
    if (!word) return NextResponse.json({ error: "Word is required" }, { status: 400 });

    const sentence_en = (formData.get("sentence_en") as string)?.trim() || "";
    const sentence_zh = (formData.get("sentence_zh") as string)?.trim() || "";

    const receiverUsername = (formData.get("receiverUsername") as string)?.trim();
    if (!receiverUsername) {
      return NextResponse.json({ error: "receiverUsername is required" }, { status: 400 });
    }

    const db = await getDB();

    // Look up receiver
    const receiver = await db
      .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
      .bind(receiverUsername)
      .first<{ id: string }>();

    if (!receiver) {
      return NextResponse.json({ error: "Receiver not found" }, { status: 404 });
    }

    if (receiver.id === userId) {
      return NextResponse.json({ error: "Cannot send to yourself" }, { status: 400 });
    }

    const scribbleId = crypto.randomUUID();
    const r2Key = `scribbles/${scribbleId}.png`;
    const bucket = await getPhotoBucket();

    await bucket.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: "image/png" },
    });

    await db
      .prepare(
        `INSERT INTO scribbles (id, sender_id, receiver_id, word, sentence_en, sentence_zh, drawing_r2_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(scribbleId, userId, receiver.id, word, sentence_en, sentence_zh, r2Key)
      .run();

    return NextResponse.json(
      { id: scribbleId, url: `/api/photos/${r2Key}` },
      { status: 201 }
    );
  });
}