import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  return withAuth(async (userId) => {
    const q = new URL(req.url).searchParams.get("q")?.toLowerCase() ?? "";
    if (q.length < 2) return NextResponse.json([]);

    const db = await getDB();
    const rows = await db
      .prepare(
        `SELECT id, username, display_name FROM users
         WHERE username LIKE ? AND id != ?
         LIMIT 10`
      )
      .bind(`${q}%`, userId)
      .all<{ id: string; username: string; display_name: string }>();

    return NextResponse.json(
      rows.results.map((r) => ({ id: r.id, username: r.username, displayName: r.display_name }))
    );
  });
}
