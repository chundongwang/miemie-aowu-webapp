import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { hashPassword, setAuthCookie } from "@/lib/auth";

// NOTE: no `export const runtime = "edge"` — testing if that was the culprit
console.log("[register] module evaluated");

export async function POST(req: NextRequest) {
  try {
    console.log("[register] step 1: parsing body");
    const { username, password, displayName, phone } = await req.json() as {
      username: string; password: string; displayName?: string; phone?: string;
    };

    console.log("[register] step 2: validation");
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return NextResponse.json({ error: "Username must be 3-30 lowercase letters, numbers, or underscores" }, { status: 400 });
    }

    console.log("[register] step 3: getDB");
    const db = await getDB();

    console.log("[register] step 4: check existing");
    const existing = await db
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username.toLowerCase())
      .first();
    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    console.log("[register] step 5: hash password");
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    console.log("[register] step 6: insert user");
    const resolvedDisplayName = displayName?.trim() || username;
    const now = Date.now();
    await db
      .prepare("INSERT INTO users (id, username, phone, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, username.toLowerCase(), phone?.trim() || null, passwordHash, resolvedDisplayName, now)
      .run();

    console.log("[register] step 7: setAuthCookie");
    await setAuthCookie(id);

    console.log("[register] step 8: done");
    return NextResponse.json({ id, username: username.toLowerCase(), displayName: resolvedDisplayName }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[register] FAILED:", msg, stack ?? "");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
