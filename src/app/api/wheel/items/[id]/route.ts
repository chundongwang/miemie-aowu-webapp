import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { callOpenRouter } from "@/lib/llm";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(async () => {
    const { id } = await params;
    const { emoji, zh } = await req.json() as { emoji?: string; zh?: string };
    if (!zh?.trim()) return NextResponse.json({ error: "zh required" }, { status: 400 });

    let en = zh.trim();
    try {
      const raw = await callOpenRouter(
        zh.trim(),
        "Translate this Chinese food or dish name to English. Return only the English name, 2–5 words, no explanation, no punctuation."
      );
      en = raw.trim().replace(/^["']|["']$/g, "");
    } catch { /* fall back to zh */ }

    const db = await getDB();
    await db
      .prepare("UPDATE wheel_items SET emoji = ?, zh = ?, en = ? WHERE id = ?")
      .bind(emoji?.trim() || "🍽️", zh.trim(), en, id)
      .run();

    return NextResponse.json({ id, emoji: emoji?.trim() || "🍽️", zh: zh.trim(), en });
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  return withAuth(async () => {
    const { id } = await params;
    const db = await getDB();

    const count = await db
      .prepare("SELECT COUNT(*) AS n FROM wheel_items")
      .first<{ n: number }>();
    if ((count?.n ?? 0) <= 3) {
      return NextResponse.json({ error: "Minimum 3 items required" }, { status: 400 });
    }

    await db.prepare("DELETE FROM wheel_items WHERE id = ?").bind(id).run();
    return NextResponse.json({ ok: true });
  });
}
