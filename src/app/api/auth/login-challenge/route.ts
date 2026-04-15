import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { setAuthCookie } from "@/lib/auth";
import { callOpenRouter } from "@/lib/llm";
import { withErrorHandling } from "@/lib/api";

const PROFESSOR_PROMPT = `You are Professor Higgins, a notoriously exacting English teacher with impossibly high standards. You are brilliant, merciless, and darkly witty. You find something to criticize in even the best answers. When a student is wrong, you are devastating but briefly educational.

Keep your comment to 1–2 sentences, maximum 160 characters. Always respond in English.

Evaluate whether the student correctly demonstrated understanding of the given word. They must either:
1. Use the word correctly in a grammatical English sentence, OR
2. Provide an accurate Chinese translation of the word.

Return ONLY valid JSON: {"correct":true/false,"comment":"your response"}`;

export async function POST(req: NextRequest) {
  return withErrorHandling("auth.login-challenge", async () => {
    const { username, sharedUsername, word, answer } = await req.json() as {
      username: string; sharedUsername: string; word: string; answer: string;
    };

    if (!username?.trim() || !sharedUsername?.trim() || !word?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    const db = await getDB();

    // Look up both users
    const user = await db
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username.toLowerCase().trim())
      .first<{ id: string }>();

    const shared = await db
      .prepare("SELECT id FROM users WHERE username = ?")
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
        PROFESSOR_PROMPT
      );
    } catch {
      return NextResponse.json({ error: "AI unavailable" }, { status: 502 });
    }

    const json = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();

    let result: { correct: boolean; comment: string };
    try {
      result = JSON.parse(json) as { correct: boolean; comment: string };
    } catch {
      return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 });
    }

    if (result.correct) {
      await setAuthCookie(user.id);
    }

    return NextResponse.json({
      correct: Boolean(result.correct),
      comment: String(result.comment ?? ""),
    });
  });
}
