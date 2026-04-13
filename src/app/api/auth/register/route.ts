import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDB } from "@/lib/db";
import { hashPassword, setAuthCookie } from "@/lib/auth";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const { email, password, username, displayName } = await req.json() as {
    email: string; password: string; username: string; displayName: string;
  };

  if (!email || !password || !username || !displayName) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3-30 lowercase letters, numbers, or underscores" },
      { status: 400 }
    );
  }

  const db = await getDB();

  const existing = await db
    .prepare("SELECT id FROM users WHERE email = ? OR username = ?")
    .bind(email.toLowerCase(), username.toLowerCase())
    .first();

  if (existing) {
    return NextResponse.json({ error: "Email or username already taken" }, { status: 409 });
  }

  const id = nanoid();
  const passwordHash = await hashPassword(password);
  const now = Date.now();

  await db
    .prepare(
      "INSERT INTO users (id, username, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, username.toLowerCase(), email.toLowerCase(), passwordHash, displayName, now)
    .run();

  await setAuthCookie(id);

  return NextResponse.json({ id, username: username.toLowerCase(), displayName }, { status: 201 });
}
