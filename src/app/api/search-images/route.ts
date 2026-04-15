import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { searchImages } from "@/lib/serp";


export async function GET(req: NextRequest) {
  return withAuth(async () => {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
    const results = await searchImages(q, 8);
    return NextResponse.json({ results });
  });
}
