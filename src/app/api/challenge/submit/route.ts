import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { currentPeriod, pickWordForPeriod } from "@/lib/ielts-words";
import { callOpenRouter } from "@/lib/llm";
import { professorPrompt, parseEval } from "@/lib/professor";

type Row = { date_str: string; skipped: number };

function calcStreak(rows: Row[], today: string): number {
  const answeredDates = new Set(rows.filter((r) => !r.skipped).map((r) => r.date_str));
  let streak = 0;
  let check = today;
  for (let i = 0; i < 60; i++) {
    if (!answeredDates.has(check)) break;
    streak++;
    const d = new Date(check + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    check = d.toISOString().slice(0, 10);
  }
  return streak;
}

export async function POST(req: NextRequest) {
  return withAuth(async (userId) => {
    const period  = currentPeriod();
    const today   = period.slice(0, 10);
    const word    = pickWordForPeriod(period);
    const db      = await getDB();

    const { answer, skip, locale = "en" } = await req.json() as {
      answer?: string; skip?: boolean; locale?: string;
    };
    const now = Date.now();
    const id  = crypto.randomUUID();

    if (skip) {
      await db
        .prepare("INSERT INTO challenge_results (id, user_id, date_str, period_str, word, skipped, answered_at) VALUES (?, ?, ?, ?, ?, 1, ?)")
        .bind(id, userId, today, period, word, now).run();
      const rows = await db
        .prepare("SELECT date_str, skipped FROM challenge_results WHERE user_id = ? AND date_str <= ? ORDER BY answered_at DESC LIMIT 120")
        .bind(userId, today).all<Row>();
      return NextResponse.json({ skipped: true, streak: calcStreak(rows.results, today) });
    }

    if (!answer?.trim()) {
      return NextResponse.json({ error: "answer required" }, { status: 400 });
    }

    let raw: string;
    try {
      raw = await callOpenRouter(
        `Word: "${word}"\nStudent's answer: "${answer.trim()}"`,
        professorPrompt(locale)
      );
    } catch {
      return NextResponse.json({ error: "AI unavailable" }, { status: 502 });
    }

    const { correct, comment } = parseEval(raw);

    await db
      .prepare("INSERT INTO challenge_results (id, user_id, date_str, period_str, word, skipped, correct, comment, answered_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)")
      .bind(id, userId, today, period, word, correct ? 1 : 0, comment, now).run();

    // Find or create the user's IELTS vocab list, then add the word as an item
    let ieltsListId: string;
    const existingList = await db
      .prepare("SELECT id FROM lists WHERE owner_id = ? AND category = 'ielts' LIMIT 1")
      .bind(userId).first<{ id: string }>();
    if (existingList) {
      ieltsListId = existingList.id;
    } else {
      ieltsListId = crypto.randomUUID();
      await db
        .prepare("INSERT INTO lists (id, owner_id, title, emoji, category, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
        .bind(ieltsListId, userId, "IELTS Daily Challenge", "🧠", "ielts", now, now).run();
    }

    const itemId = crypto.randomUUID();
    await db
      .prepare("INSERT INTO items (id, list_id, name, reason, position, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)")
      .bind(itemId, ieltsListId, `${word} ${correct ? "✅" : "❓"}`, comment, now, now).run();
    await db
      .prepare("UPDATE lists SET updated_at = ? WHERE id = ?")
      .bind(now, ieltsListId).run();

    const rows = await db
      .prepare("SELECT date_str, skipped FROM challenge_results WHERE user_id = ? AND date_str <= ? ORDER BY answered_at DESC LIMIT 120")
      .bind(userId, today).all<Row>();

    return NextResponse.json({ correct, comment, streak: calcStreak(rows.results, today) });
  });
}
