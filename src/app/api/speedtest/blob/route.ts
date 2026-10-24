import { NextRequest } from "next/server";

// Incompressible payload for the /speedtest throughput measurement.
// Random bytes so neither Cloudflare nor nginx can shrink it. Capped at 4 MiB.
const MAX = 4 * 1024 * 1024;
const DEFAULT = 1024 * 1024;

export async function GET(req: NextRequest) {
  const asked = Number(req.nextUrl.searchParams.get("bytes")) || DEFAULT;
  const size = Math.min(Math.max(asked, 1024), MAX);
  const buf = new Uint8Array(size);
  // getRandomValues is limited to 64 KiB per call
  for (let off = 0; off < size; off += 65536) {
    crypto.getRandomValues(buf.subarray(off, Math.min(off + 65536, size)));
  }
  return new Response(buf, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Cache-Control": "no-store",
    },
  });
}
