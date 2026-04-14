import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getAuthUserId, hashPassword, verifyPassword } from "@/lib/auth";


export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDB();
  const user = await db
    .prepare("SELECT id, username, display_name FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; username: string; display_name: string }>();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ id: user.id, username: user.username, displayName: user.display_name });
}

export async function PATCH(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { displayName, currentPassword, newPassword } = await req.json() as {
    displayName?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  const db = await getDB();

  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }
    const user = await db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .bind(userId)
      .first<{ password_hash: string }>();
    if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
    const newHash = await hashPassword(newPassword);
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newHash, userId).run();
  }

  if (displayName?.trim()) {
    await db
      .prepare("UPDATE users SET display_name = ? WHERE id = ?")
      .bind(displayName.trim(), userId)
      .run();
  }

  return NextResponse.json({ ok: true });
}
