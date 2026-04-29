import { NextRequest, NextResponse } from "next/server";
import { getPhotoBucket } from "@/lib/db";


type Params = { params: Promise<{ key: string[] }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { key } = await params;
  const r2Key = key.join("/");

  const bucket = await getPhotoBucket();
  const object = await bucket.get(r2Key);

  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  const buffer = await object.arrayBuffer();
  return new NextResponse(buffer, { headers });
}
