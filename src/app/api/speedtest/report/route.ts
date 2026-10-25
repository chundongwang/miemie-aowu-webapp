import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";

// Receives a /speedtest result line. Stored in D1 (speedtest_reports) and
// echoed to Worker logs. Body is capped; nothing else about the client is kept
// beyond the first X-Forwarded-For hop and the user agent.
export async function POST(req: NextRequest) {
  const text = (await req.text()).slice(0, 4000);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const ua = (req.headers.get("user-agent") || "").slice(0, 500) || null;
  console.log(JSON.stringify({ level: "info", type: "speedtest", ts: new Date().toISOString(), ip, report: text }));
  try {
    const db = await getDB();
    await db
      .prepare("INSERT INTO speedtest_reports (created_at, client_ip, user_agent, report) VALUES (?, ?, ?, ?)")
      .bind(Date.now(), ip, ua, text)
      .run();
  } catch (e) {
    console.log(JSON.stringify({ level: "warn", type: "speedtest-store-failed", error: String(e) }));
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
