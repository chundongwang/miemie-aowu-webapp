import { NextResponse } from "next/server";

// Tiny Worker round-trip probe for /speedtest. No auth, never cached.
export async function GET() {
  return NextResponse.json(
    { ok: true, t: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
