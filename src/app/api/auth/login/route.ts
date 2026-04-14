import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { verifyPassword, setAuthCookie } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  return withErrorHandling("auth.login", async () => {
    const { username, password } = await req.json() as { username: string; password: string };

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const db = await getDB();
    const user = await db
      .prepare("SELECT id, username, display_name, password_hash FROM users WHERE username = ?")
      .bind(username.toLowerCase())
      .first<{ id: string; username: string; display_name: string; password_hash: string }>();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    await setAuthCookie(user.id);

    return NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
    });
  });
}
