import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { callOpenRouter } from "@/lib/llm";

type Grade = "exact" | "similar" | "wrong";

function parseGrade(raw: string): Grade | null {
  try {
    const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(json) as { grade?: string };
    const g = String(parsed.grade ?? "").toLowerCase().trim();
    if (g === "exact" || g === "similar" || g === "wrong") return g;
    return null;
  } catch {
    return null;
  }
}

// Local fallback when the LLM errors. Only catches true exact matches.
function localFallbackGrade(idiom: string, guess: string): Grade {
  const a = idiom.replace(/\s+/g, "").trim();
  const b = guess.replace(/\s+/g, "").trim();
  if (!a || !b) return "wrong";
  return a === b ? "exact" : "wrong";
}

export async function POST(req: NextRequest) {
  return withAuth(async (userId) => {
    const body = (await req.json().catch(() => null)) as { id?: string; guess?: string } | null;
    const id = body?.id?.trim();
    const guess = body?.guess?.trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (!guess) return NextResponse.json({ error: "guess is required" }, { status: 400 });
    if (guess.length > 100) {
      return NextResponse.json({ error: "guess too long" }, { status: 400 });
    }

    const db = await getDB();
    const row = await db
      .prepare(
        `SELECT s.id, s.word AS answer, s.prompt_id, s.idiom_id, s.guess_grade,
                p.category    AS p_category,
                p.drawer_description AS p_drawer_desc,
                i.pinyin      AS i_pinyin,
                i.explanation AS i_explanation
         FROM scribbles s
         LEFT JOIN scribble_prompts p ON p.id = s.prompt_id
         LEFT JOIN idioms i ON i.id = s.idiom_id
         WHERE s.id = ? AND s.receiver_id = ?
         LIMIT 1`
      )
      .bind(id, userId)
      .first<{
        id: string;
        answer: string;
        prompt_id: string | null;
        idiom_id: number | null;
        guess_grade: string | null;
        p_category: string | null;
        p_drawer_desc: string | null;
        i_pinyin: string | null;
        i_explanation: string | null;
      }>();

    if (!row) return NextResponse.json({ error: "Scribble not found" }, { status: 404 });
    if (row.guess_grade) {
      return NextResponse.json({ error: "Already guessed" }, { status: 400 });
    }

    const isPrompt = row.prompt_id !== null;

    let grade: Grade;
    try {
      const userPrompt = isPrompt
        ? `类别 (category): "${row.p_category ?? ""}"
答案 (target word): "${row.answer}"
答案的描述 (description): "${row.p_drawer_desc ?? ""}"
玩家的猜测 (user's guess): "${guess}"`
        : `成语 (target): "${row.answer}"
拼音: "${row.i_pinyin ?? ""}"
释义: "${row.i_explanation ?? ""}"
玩家的猜测 (user's guess): "${guess}"`;

      const systemPrompt = isPrompt
        ? `你正在评判一个画图猜词游戏。玩家看到一幅画和一个类别提示，然后写下了他们猜测的词。

判断标准（忽略大小写、空格、繁简体差异；拼音也算匹配）：
- "exact"：完全相同的词，或同一事物的常见别名/俗称（例如答案是"宫保鸡丁"，猜"宫爆鸡丁"也算）。
- "similar"：不是同一个词，但属于同一类别内非常接近的事物或近义词（例如答案是"沙发"，猜"椅子"算 similar；答案"麻婆豆腐"，猜"水煮鱼"算 similar；答案"周杰伦"，猜"林俊杰"算 similar）。
- "wrong"：完全不相关，或者只有非常微弱的联系。

只返回 JSON，不要 markdown：
{"grade": "exact" | "similar" | "wrong"}`
        : `你正在评判一个汉语成语猜谜游戏。玩家看到一幅画着某个成语的图，然后写下了他们猜测的成语。

判断标准（忽略大小写、空格、繁简体差异）：
- "exact"：完全相同的成语（即使一两个字写错或繁简体不同，但整体明显就是这个成语）。玩家如果写出正确拼音（如 "ai cai ruo ke"），也算 exact。
- "similar"：不是同一个成语，但意思非常接近 —— 同义、近义、或者描述的是同一个画面/概念。
- "wrong"：完全不相关，或者只有非常微弱的联系。

只返回 JSON，不要 markdown：
{"grade": "exact" | "similar" | "wrong"}`;

      const raw = await callOpenRouter(userPrompt, systemPrompt);
      grade = parseGrade(raw) ?? localFallbackGrade(row.answer, guess);
    } catch {
      grade = localFallbackGrade(row.answer, guess);
    }

    const now = Date.now();
    await db
      .prepare(
        `UPDATE scribbles
         SET guess_text = ?, guess_grade = ?, guessed_at = ?
         WHERE id = ? AND receiver_id = ?`
      )
      .bind(guess, grade, now, id, userId)
      .run();

    return NextResponse.json({
      grade,
      word: row.answer,
      drawerDescription: row.p_drawer_desc ?? "",
      pinyin: row.i_pinyin ?? "",
      explanation: row.i_explanation ?? "",
      guessedAt: now,
    });
  });
}
