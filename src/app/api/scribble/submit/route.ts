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

    const idiomIdRaw = (formData.get("idiomId") as string)?.trim();
    const idiomId = Number(idiomIdRaw);
    if (!Number.isFinite(idiomId) || idiomId <= 0) {
      return NextResponse.json({ error: "idiomId is required" }, { status: 400 });
    }

    const receiverUsername = (formData.get("receiverUsername") as string)?.trim();
    if (!receiverUsername) {
      return NextResponse.json({ error: "receiverUsername is required" }, { status: 400 });
    }

    const db = await getDB();

    // Verify the idiom exists and snapshot its text (so guess judging
    // doesn't have to JOIN, and a future idioms-table edit can't change
    // the answer mid-game).
    const idiomRow = await db
      .prepare("SELECT id, idiom FROM idioms WHERE id = ? LIMIT 1")
      .bind(idiomId)
      .first<{ id: number; idiom: string }>();
    if (!idiomRow) {
      return NextResponse.json({ error: "Idiom not found" }, { status: 404 });
    }

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

    // We still write the legacy sentence_en/sentence_zh columns (NOT NULL
    // in the original schema) but with empty strings; pinyin/explanation
    // are looked up on read via JOIN.
    await db
      .prepare(
        `INSERT INTO scribbles (id, sender_id, receiver_id, word, sentence_en, sentence_zh, drawing_r2_key, idiom_id)
         VALUES (?, ?, ?, ?, '', '', ?, ?)`
      )
      .bind(scribbleId, userId, receiver.id, idiomRow.idiom, r2Key, idiomRow.id)
      .run();

    return NextResponse.json(
      { id: scribbleId, url: `/api/photos/${r2Key}` },
      { status: 201 }
    );
  });
}
