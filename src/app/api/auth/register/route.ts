import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { hashPassword, setAuthCookie } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api";

export async function POST(req: NextRequest) {
  return withErrorHandling("auth.register", async () => {
    const { username, password, displayName, phone } = await req.json() as {
      username: string; password: string; displayName?: string; phone?: string;
    };

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    const normalizedUsername = username.toLowerCase().trim();
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      return NextResponse.json({ error: "Username must be 3-30 letters, numbers, or underscores" }, { status: 400 });
    }

    const db = await getDB();
    const existing = await db
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(normalizedUsername)
      .first();
    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const resolvedDisplayName = displayName?.trim() || normalizedUsername;
    const now = Date.now();

    await db
      .prepare("INSERT INTO users (id, username, phone, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, normalizedUsername, phone?.trim() || null, passwordHash, resolvedDisplayName, now)
      .run();

    await setAuthCookie(id);
    return NextResponse.json({ id, username: normalizedUsername, displayName: resolvedDisplayName }, { status: 201 });
  });
}
