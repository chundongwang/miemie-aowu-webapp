import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth, withErrorHandling } from "@/lib/api";
import { callOpenRouter } from "@/lib/llm";

export async function GET() {
  return withErrorHandling("wheel.items.get", async () => {
    const db = await getDB();
    const rows = await db
      .prepare("SELECT id, emoji, zh, en FROM wheel_items ORDER BY created_at ASC")
      .all<{ id: string; emoji: string; zh: string; en: string }>();
    return NextResponse.json(rows.results);
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (userId) => {
    const { emoji, zh } = await req.json() as { emoji?: string; zh?: string };
    if (!zh?.trim()) return NextResponse.json({ error: "zh required" }, { status: 400 });

    // Auto-translate zh → en using LLM
    let en = zh.trim();
    try {
      const raw = await callOpenRouter(
        zh.trim(),
        "Translate this Chinese food or dish name to English. Return only the English name, 2–5 words, no explanation, no punctuation."
      );
      en = raw.trim().replace(/^["']|["']$/g, "");
    } catch { /* fall back to zh if translation fails */ }

    const db = await getDB();
    const id = crypto.randomUUID();
    await db
      .prepare("INSERT INTO wheel_items (id, emoji, zh, en, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, (emoji?.trim() || "🍽️"), zh.trim(), en, userId, Date.now())
      .run();

    return NextResponse.json({ id, emoji: emoji?.trim() || "🍽️", zh: zh.trim(), en }, { status: 201 });
  });
}
