import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { searchImages } from "@/lib/serp";


type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id: itemId } = await params;
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

    const db = await getDB();
    const item = await db
      .prepare(`SELECT i.id, l.owner_id, l.recipient_id FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = ?`)
      .bind(itemId)
      .first<{ id: string; owner_id: string; recipient_id: string | null }>();

    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.owner_id !== userId && item.recipient_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const results = await searchImages(q, 8);

    return NextResponse.json({ results });
  });
}
