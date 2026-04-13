import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { verifyPassword, setAuthCookie } from "@/lib/auth";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json() as { email: string; password: string };

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const db = await getDB();
  const user = await db
    .prepare("SELECT id, username, display_name, password_hash FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<{ id: string; username: string; display_name: string; password_hash: string }>();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await setAuthCookie(user.id);

  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
  });
}
