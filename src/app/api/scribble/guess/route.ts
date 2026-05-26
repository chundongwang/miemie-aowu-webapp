import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { callOpenRouter } from "@/lib/llm";
import {
  GUESS_TIMER_MS,
  betterGrade,
  gradeFor,
  isExactCloseness,
  type Grade,
} from "@/lib/scribbleGrade";

type LLMVerdict = { closeness: number; label: "exact" | "similar" | "wrong" };

function parseLLMVerdict(raw: string): LLMVerdict | null {
  try {
    const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(json) as { closeness?: number; label?: string };
    const closeness = Number(parsed.closeness);
    const label = String(parsed.label ?? "").toLowerCase().trim();
    if (!Number.isFinite(closeness)) return null;
    if (label !== "exact" && label !== "similar" && label !== "wrong") return null;
    return {
      closeness: Math.max(0, Math.min(100, Math.round(closeness))),
      label,
    };
  } catch {
    return null;
  }
}

// Local fallback when the LLM errors. Catches exact (normalized) match only;
// everything else is treated as a near-zero closeness wrong.
function localFallback(answer: string, guess: string): LLMVerdict {
  const a = answer.replace(/\s+/g, "").trim();
  const b = guess.replace(/\s+/g, "").trim();
  if (a && b && a === b) return { closeness: 100, label: "exact" };
  return { closeness: 10, label: "wrong" };
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
        `SELECT s.id, s.word AS answer, s.prompt_id, s.idiom_id,
                s.viewed_at, s.final_grade,
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
        viewed_at: number | null;
        final_grade: string | null;
        p_category: string | null;
        p_drawer_desc: string | null;
        i_pinyin: string | null;
        i_explanation: string | null;
      }>();

    if (!row) return NextResponse.json({ error: "Scribble not found" }, { status: 404 });
    if (row.final_grade) {
      return NextResponse.json({ error: "Already finished" }, { status: 400 });
    }

    // The timer anchor MUST be set before guessing — the client is expected
    // to POST /api/scribble/view on open. As a defensive fallback, anchor it
    // here on the first guess so a misbehaving client can't bypass scoring.
    const now = Date.now();
    let viewedAt = row.viewed_at;
    if (viewedAt == null) {
      viewedAt = now;
      await db
        .prepare("UPDATE scribbles SET viewed_at = ? WHERE id = ?")
        .bind(viewedAt, id)
        .run();
    }

    const timeUsedMs = Math.max(0, now - viewedAt);
    if (timeUsedMs > GUESS_TIMER_MS) {
      // Server-side timeout. Finalize with the best grade earned so far so a
      // strong guess that didn't quite hit "exact" still counts.
      const best = await db
        .prepare(
          `SELECT grade FROM scribble_guesses
           WHERE scribble_id = ? AND grade IS NOT NULL
           ORDER BY CASE grade WHEN 'S' THEN 5 WHEN 'A' THEN 4 WHEN 'B' THEN 3 WHEN 'C' THEN 2 WHEN 'D' THEN 1 ELSE 0 END DESC
           LIMIT 1`
        )
        .bind(id)
        .first<{ grade: Grade }>();
      const finalized: Grade = best?.grade ?? "F";
      await db
        .prepare(
          `UPDATE scribbles
           SET final_grade = ?, guess_grade = 'wrong', guessed_at = ?
           WHERE id = ? AND final_grade IS NULL`
        )
        .bind(finalized, now, id)
        .run();
      return NextResponse.json({ error: "Time's up", finalGrade: finalized }, { status: 400 });
    }

    const isPrompt = row.prompt_id !== null;

    let verdict: LLMVerdict;
    try {
      const userPrompt = isPrompt
        ? `类别 (category): "${row.p_category ?? ""}"
答案 (target word): "${row.answer}"
答案描述 (description): "${row.p_drawer_desc ?? ""}"
玩家的猜测 (user's guess): "${guess}"`
        : `成语 (target): "${row.answer}"
拼音: "${row.i_pinyin ?? ""}"
释义: "${row.i_explanation ?? ""}"
玩家的猜测 (user's guess): "${guess}"`;

      const systemPrompt = isPrompt
        ? `你正在评判一个画图猜词游戏。玩家看到一幅画和一个类别提示，写下了他们猜测的词。

返回一个 closeness 分数 (0..100)，描述他们离正确答案有多近：
- 95-100: 同一个东西 (完全相同的词、常见别名或拼写变体，例如答案"宫保鸡丁"猜"宫爆鸡丁")。
- 75-94:  同一类别内非常接近的事物或近义词 (例如答案"沙发"猜"椅子"；答案"麻婆豆腐"猜"水煮鱼"；答案"周杰伦"猜"林俊杰")。
- 50-74:  方向对但偏远 (例如答案"宫保鸡丁"猜"川菜"；类别对但具体的事物相差较远)。
- 25-49:  只有非常微弱的联系。
- 0-24:   完全不相关。

同时返回一个 label：
- "exact":   closeness >= 90 (游戏可以结束)
- "similar": 50 <= closeness < 90
- "wrong":   closeness < 50

只返回 JSON，不要 markdown：
{"closeness": 0-100, "label": "exact" | "similar" | "wrong"}`
        : `你正在评判一个汉语成语猜谜游戏。玩家看到一幅画着某个成语的图，写下了他们猜测的成语。

返回一个 closeness 分数 (0..100)：
- 95-100: 完全相同的成语 (一两字写错或繁简体差异也算；写出正确拼音也算)。
- 75-94:  同义/近义成语，或描述同一画面/概念的不同成语。
- 50-74:  方向对但相差较远。
- 25-49:  只有非常微弱的联系。
- 0-24:   完全不相关。

同时返回 label：
- "exact":   closeness >= 90
- "similar": 50 <= closeness < 90
- "wrong":   closeness < 50

只返回 JSON：
{"closeness": 0-100, "label": "exact" | "similar" | "wrong"}`;

      const raw = await callOpenRouter(userPrompt, systemPrompt);
      verdict = parseLLMVerdict(raw) ?? localFallback(row.answer, guess);
    } catch {
      verdict = localFallback(row.answer, guess);
    }

    const ratio = timeUsedMs / GUESS_TIMER_MS;
    const perGuessGrade: Grade = gradeFor(verdict.closeness, ratio);

    const guessId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO scribble_guesses (id, scribble_id, guesser_id, guess_text, closeness, grade, time_used_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(guessId, id, userId, guess, verdict.closeness, perGuessGrade, timeUsedMs, now)
      .run();

    // Pull the running-best grade across all attempts so far. We update
    // scribbles.final_grade only when the game is over (exact match here, or
    // timer expiry on a subsequent call, or explicit reveal).
    const best = await db
      .prepare(
        `SELECT grade FROM scribble_guesses
         WHERE scribble_id = ? AND grade IS NOT NULL
         ORDER BY CASE grade WHEN 'S' THEN 5 WHEN 'A' THEN 4 WHEN 'B' THEN 3 WHEN 'C' THEN 2 WHEN 'D' THEN 1 ELSE 0 END DESC
         LIMIT 1`
      )
      .bind(id)
      .first<{ grade: Grade }>();
    const bestGrade: Grade = betterGrade(best?.grade, perGuessGrade);

    let finalGrade: Grade | null = null;
    let answerWord: string | null = null;
    let answerDescription: string | null = null;
    let answerPinyin: string | null = null;
    let answerExplanation: string | null = null;
    if (isExactCloseness(verdict.closeness)) {
      finalGrade = bestGrade;
      // Mark game over. Keep guess_grade in sync (mapped) for legacy UI bits
      // that may still branch on it, and snapshot the latest guess as the
      // "winning" guess_text.
      await db
        .prepare(
          `UPDATE scribbles
           SET final_grade = ?, guess_grade = 'exact', guess_text = ?, guessed_at = ?
           WHERE id = ? AND final_grade IS NULL`
        )
        .bind(finalGrade, guess, now, id)
        .run();
      answerWord = row.answer;
      answerDescription = row.p_drawer_desc;
      answerPinyin = row.i_pinyin;
      answerExplanation = row.i_explanation;
    }

    return NextResponse.json({
      guessId,
      guess,
      closeness: verdict.closeness,
      label: verdict.label,
      grade: perGuessGrade,
      timeUsedMs,
      timerMs: GUESS_TIMER_MS,
      // Populated only when the game just ended on this guess.
      finalGrade,
      // Answer is revealed only when the game ends.
      word: answerWord,
      drawerDescription: answerDescription ?? "",
      pinyin: answerPinyin ?? "",
      explanation: answerExplanation ?? "",
    });
  });
}
