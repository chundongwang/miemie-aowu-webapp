import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { currentPeriod, pickWordForPeriod } from "@/lib/ielts-words";

type Row = { date_str: string; period_str: string | null; skipped: number; correct: number | null; comment: string | null };

/** Count consecutive days ending at `today` that have at least one non-skipped answer. */
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

export async function GET() {
  return withAuth(async (userId) => {
    const period = currentPeriod();                     // "2026-04-22-14"
    const today  = period.slice(0, 10);                 // "2026-04-22"
    const word   = pickWordForPeriod(period);
    const db     = await getDB();

    const rows = await db
      .prepare(
        "SELECT date_str, period_str, skipped, correct, comment FROM challenge_results WHERE user_id = ? AND date_str <= ? ORDER BY answered_at DESC LIMIT 120"
      )
      .bind(userId, today)
      .all<Row>();

    const streak = calcStreak(rows.results, today);

    // How many distinct periods completed today (non-skipped)
    const todayDoneCount = new Set(
      rows.results.filter((r) => r.date_str === today && !r.skipped).map((r) => r.period_str)
    ).size;

    // Latest attempt for this specific period
    const periodRows = rows.results.filter((r) => (r.period_str ?? r.date_str + "-00") === period);
    const latest = periodRows[0] ?? null;

    if (!latest) {
      return NextResponse.json({ word, period, dateStr: today, status: "pending", streak, todayDoneCount });
    }
    if (latest.skipped) {
      return NextResponse.json({ word, period, dateStr: today, status: "skipped", streak, todayDoneCount });
    }
    return NextResponse.json({
      word, period, dateStr: today,
      status: "answered",
      correct: latest.correct === 1,
      comment: latest.comment,
      streak,
      todayDoneCount,
    });
  });
}
