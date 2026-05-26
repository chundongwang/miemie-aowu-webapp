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

    // Optional recording JSON for animated replay. Treated as best-effort —
    // if the upload or validation fails, the scribble still works as a static
    // image. Capped well below MAX_BYTES since recordings should be small.
    const recording = formData.get("recording") as File | null;
    if (recording && recording.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Recording too large" }, { status: 400 });
    }

    // New flow uses promptId (LLM-generated). idiomId is accepted for
    // backwards compat with any in-flight client that hasn't reloaded yet.
    const promptId = (formData.get("promptId") as string | null)?.trim() ?? "";
    const idiomIdRaw = (formData.get("idiomId") as string | null)?.trim() ?? "";
    if (!promptId && !idiomIdRaw) {
      return NextResponse.json({ error: "promptId or idiomId is required" }, { status: 400 });
    }

    const receiverUsername = (formData.get("receiverUsername") as string)?.trim();
    if (!receiverUsername) {
      return NextResponse.json({ error: "receiverUsername is required" }, { status: 400 });
    }

    const db = await getDB();

    // Resolve the answer word from whichever prompt source the client used.
    // We snapshot the answer into scribbles.word so a later edit to the
    // prompts/idioms tables can't change the answer mid-game.
    let answerWord: string;
    let idiomIdValue: number | null = null;
    let promptIdValue: string | null = null;
    if (promptId) {
      const promptRow = await db
        .prepare("SELECT id, word FROM scribble_prompts WHERE id = ? AND created_by = ? LIMIT 1")
        .bind(promptId, userId)
        .first<{ id: string; word: string }>();
      if (!promptRow) {
        return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
      }
      answerWord = promptRow.word;
      promptIdValue = promptRow.id;
    } else {
      const idiomId = Number(idiomIdRaw);
      if (!Number.isFinite(idiomId) || idiomId <= 0) {
        return NextResponse.json({ error: "idiomId is invalid" }, { status: 400 });
      }
      const idiomRow = await db
        .prepare("SELECT id, idiom FROM idioms WHERE id = ? LIMIT 1")
        .bind(idiomId)
        .first<{ id: number; idiom: string }>();
      if (!idiomRow) {
        return NextResponse.json({ error: "Idiom not found" }, { status: 404 });
      }
      answerWord = idiomRow.idiom;
      idiomIdValue = idiomRow.id;
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

    let recordingR2Key: string | null = null;
    if (recording) {
      recordingR2Key = `scribbles/${scribbleId}.json`;
      await bucket.put(recordingR2Key, await recording.arrayBuffer(), {
        httpMetadata: { contentType: "application/json" },
      });
    }

    // We still write the legacy sentence_en/sentence_zh columns (NOT NULL
    // in the original schema) but with empty strings.
    await db
      .prepare(
        `INSERT INTO scribbles (id, sender_id, receiver_id, word, sentence_en, sentence_zh, drawing_r2_key, idiom_id, prompt_id, recording_r2_key)
         VALUES (?, ?, ?, ?, '', '', ?, ?, ?, ?)`
      )
      .bind(scribbleId, userId, receiver.id, answerWord, r2Key, idiomIdValue, promptIdValue, recordingR2Key)
      .run();

    return NextResponse.json(
      { id: scribbleId, url: `/api/photos/${r2Key}` },
      { status: 201 }
    );
  });
}
