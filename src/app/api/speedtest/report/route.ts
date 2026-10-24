import { NextRequest, NextResponse } from "next/server";

// Receives a /speedtest result so the maintainer can read it from Worker logs
// (`npx wrangler tail` or Cloudflare dashboard → Workers → Logs) without the
// tester relaying screenshots. Body is capped and only logged, never stored.
export async function POST(req: NextRequest) {
  const text = (await req.text()).slice(0, 4000);
  console.log(JSON.stringify({ level: "info", type: "speedtest", ts: new Date().toISOString(), report: text }));
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
