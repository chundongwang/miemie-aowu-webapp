import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api";


const MAX_BYTES  = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

/** Proxy an external image through our server so the browser avoids CORS issues. */
export async function GET(req: NextRequest) {
  return withErrorHandling("proxy-image", async () => {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = req.nextUrl.searchParams.get("url") ?? "";
    if (!url.startsWith("http")) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const imgRes = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "miemieaowu-bot/1.0" },
    });
    if (!imgRes.ok) {
      return NextResponse.json({ error: `Upstream ${imgRes.status}` }, { status: 502 });
    }
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image" }, { status: 400 });
    }
    const buf = await imgRes.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 400 });
    }

    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  });
}
