import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

const BACKFILL_SQL = `
  INSERT OR IGNORE INTO check_ins (id, user_id, date_str, emoji, created_at)
  SELECT lower(hex(randomblob(8))), user_id, date_str, '🫥', min_ts
  FROM (
    SELECT user_id, date_str, MIN(ts) AS min_ts
    FROM (
      SELECT l.owner_id AS user_id,
             date(datetime(i.created_at/1000, 'unixepoch')) AS date_str,
             i.created_at AS ts
      FROM items i JOIN lists l ON l.id = i.list_id
      WHERE l.owner_id = ?
      UNION ALL
      SELECT l.recipient_id AS user_id,
             date(datetime(i.created_at/1000, 'unixepoch')) AS date_str,
             i.created_at AS ts
      FROM items i JOIN lists l ON l.id = i.list_id
      WHERE l.recipient_id = ?
      UNION ALL
      SELECT user_id,
             date(datetime(created_at/1000, 'unixepoch')) AS date_str,
             created_at AS ts
      FROM comments WHERE user_id = ?
      UNION ALL
      SELECT user_id,
             date(datetime(created_at/1000, 'unixepoch')) AS date_str,
             created_at AS ts
      FROM reactions WHERE user_id = ?
    )
    WHERE user_id IS NOT NULL AND date_str IS NOT NULL
    GROUP BY user_id, date_str
  )
`;

export async function GET(_req: NextRequest) {
  return withAuth(async (userId) => {
    const db = await getDB();

    // Auto-backfill historical activity dates on first visit
    const { cnt } = (await db
      .prepare("SELECT COUNT(*) AS cnt FROM check_ins WHERE user_id = ?")
      .bind(userId)
      .first<{ cnt: number }>()) ?? { cnt: 0 };

    if (cnt === 0) {
      try {
        await db.prepare(BACKFILL_SQL).bind(userId, userId, userId, userId).run();
      } catch {
        // Backfill failed — continue without it
      }
    }

    const rows = await db
      .prepare(
        `SELECT id, date_str, emoji, created_at
         FROM check_ins WHERE user_id = ?
         ORDER BY date_str DESC`
      )
      .bind(userId)
      .all();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checkIns = rows.results as any[];
    const totalDays = checkIns.length;

    // "Today" is the UTC date — close enough for a daily check-in feature
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = checkIns.find((c) => c.date_str === today);

    return NextResponse.json({
      totalDays,
      todayCheckedIn: !!todayEntry,
      todayEmoji: todayEntry?.emoji ?? null,
      checkIns: checkIns.slice(0, 10).map((c) => ({
        id: c.id,
        dateStr: c.date_str,
        emoji: c.emoji,
        createdAt: c.created_at,
      })),
    });
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async (userId) => {
    const { dateStr, emoji } = await req.json() as { dateStr: string; emoji?: string };

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "Invalid dateStr" }, { status: 400 });
    }

    const db = await getDB();
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const finalEmoji = emoji || "🫥";

    await db
      .prepare(
        `INSERT INTO check_ins (id, user_id, date_str, emoji, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, date_str) DO UPDATE SET emoji = excluded.emoji`
      )
      .bind(id, userId, dateStr, finalEmoji, createdAt)
      .run();

    const { cnt } = (await db
      .prepare("SELECT COUNT(*) AS cnt FROM check_ins WHERE user_id = ?")
      .bind(userId)
      .first<{ cnt: number }>()) ?? { cnt: 1 };

    return NextResponse.json({ totalDays: cnt, emoji: finalEmoji });
  });
}
