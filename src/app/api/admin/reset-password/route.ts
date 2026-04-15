import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api";
import { getCloudflareContext } from "@opennextjs/cloudflare";


export async function POST(req: NextRequest) {
  return withErrorHandling("admin.reset-password", async () => {
    // Verify admin secret
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as Record<string, string>;
    const adminSecret = e.ADMIN_SECRET || process.env.ADMIN_SECRET;

    if (!adminSecret) {
      return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 503 });
    }

    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${adminSecret}`) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { username, newPassword } = await req.json() as {
      username: string; newPassword: string;
    };

    if (!username?.trim() || !newPassword) {
      return NextResponse.json({ error: "username and newPassword required" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const db = await getDB();
    const user = await db
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username.toLowerCase().trim())
      .first<{ id: string }>();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const hash = await hashPassword(newPassword);
    await db
      .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .bind(hash, user.id)
      .run();

    return NextResponse.json({ ok: true, username: username.toLowerCase().trim() });
  });
}
