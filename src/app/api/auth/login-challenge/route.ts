import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { setAuthCookie } from "@/lib/auth";
import { callOpenRouter } from "@/lib/llm";
import { professorPrompt, parseEval } from "@/lib/professor";
import { withErrorHandling } from "@/lib/api";

export async function POST(req: NextRequest) {
  return withErrorHandling("auth.login-challenge", async () => {
    const { username, sharedUsername, word, answer, locale = "en" } = await req.json() as {
      username: string; sharedUsername: string; word: string; answer: string; locale?: string;
    };

    if (!username?.trim() || !sharedUsername?.trim() || !word?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    const db = await getDB();

    // Look up both users
    const user = await db
      .prepare("SELECT id FROM users WHERE username = ? AND deleted_at IS NULL")
      .bind(username.toLowerCase().trim())
      .first<{ id: string }>();

    const shared = await db
      .prepare("SELECT id FROM users WHERE username = ? AND deleted_at IS NULL")
      .bind(sharedUsername.toLowerCase().trim())
      .first<{ id: string }>();

    // Vague failure — don't reveal whether accounts exist
    const socialFail = NextResponse.json({
      correct: false,
      comment: "I cannot verify the connection between these accounts. Perhaps you've forgotten who you've shared with — a fitting metaphor for forgetting passwords.",
    });

    if (!user || !shared || user.id === shared.id) return socialFail;

    // Verify a shared list exists between the two users (either direction)
    const link = await db
      .prepare(
        `SELECT id FROM lists
         WHERE (owner_id = ? AND recipient_id = ?)
            OR (owner_id = ? AND recipient_id = ?)
         LIMIT 1`
      )
      .bind(user.id, shared.id, shared.id, user.id)
      .first<{ id: string }>();

    if (!link) return socialFail;

    // Social check passed — now evaluate the word challenge
    let raw: string;
    try {
      raw = await callOpenRouter(
        `Word: "${word}"\nStudent's answer: "${answer.trim()}"`,
        professorPrompt(locale)
      );
    } catch {
      return NextResponse.json({ error: "AI unavailable" }, { status: 502 });
    }

    let result: { correct: boolean; comment: string };
    try {
      result = parseEval(raw);
    } catch {
      return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 });
    }

    if (result.correct) {
      await setAuthCookie(user.id);
    }

    return NextResponse.json(result);
  });
}
