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

function localFallbackGrade(word: string, guess: string): Grade {
  const a = word.trim().toLowerCase();
  const b = guess.trim().toLowerCase();
  if (!a || !b) return "wrong";
  if (a === b) return "exact";
  // trivial plural/tense variants
  const variants = [a, a + "s", a + "es", a + "ed", a + "ing", a.replace(/s$/, "")];
  if (variants.includes(b)) return "exact";
  return "wrong";
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
        `SELECT id, word, sentence_en, sentence_zh, guess_grade
         FROM scribbles
         WHERE id = ? AND receiver_id = ?
         LIMIT 1`
      )
      .bind(id, userId)
      .first<{
        id: string;
        word: string;
        sentence_en: string;
        sentence_zh: string;
        guess_grade: string | null;
      }>();

    if (!row) return NextResponse.json({ error: "Scribble not found" }, { status: 404 });
    if (row.guess_grade) {
      return NextResponse.json({ error: "Already guessed" }, { status: 400 });
    }

    let grade: Grade;
    try {
      const raw = await callOpenRouter(
        `Target word: "${row.word}"
User's guess: "${guess}"`,
        `You judge a vocabulary guessing game. The user saw a drawing of an English target word and typed their guess.

Grade semantically, ignoring case, plurals, tense, and typos:
- "exact": same word or trivial variant (case/plural/tense/spelling)
- "similar": different word but very close meaning — synonym, near-synonym, or same concept the drawing likely conveys
- "wrong": unrelated or only loosely related

Return ONLY valid JSON, no markdown:
{"grade": "exact" | "similar" | "wrong"}`
      );
      grade = parseGrade(raw) ?? localFallbackGrade(row.word, guess);
    } catch {
      grade = localFallbackGrade(row.word, guess);
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
      word: row.word,
      sentenceEn: row.sentence_en,
      sentenceZh: row.sentence_zh,
      guessedAt: now,
    });
  });
}
