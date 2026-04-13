import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getAuthUserId } from "@/lib/auth";

export const runtime = "edge";

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDB();
  const user = await db
    .prepare("SELECT id, username, display_name FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; username: string; display_name: string }>();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
  });
}
