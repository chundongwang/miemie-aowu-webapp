import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

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
