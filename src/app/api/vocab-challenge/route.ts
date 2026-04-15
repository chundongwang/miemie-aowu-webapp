import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/llm";
import { withErrorHandling } from "@/lib/api";

const SYSTEM_PROMPT = `You are Professor Higgins, a notoriously exacting English teacher with impossibly high standards. You are brilliant, merciless, and darkly witty. You find something to criticize in even the best answers. When a student is wrong, you are devastating but briefly educational. When correct, you grudgingly acknowledge it with a backhanded compliment.

Keep your comment to 1–2 sentences, maximum 160 characters total. Always respond in English. Be theatrical and memorable.

Evaluate whether the student correctly demonstrated understanding of the given word. They must either:
1. Use the word correctly in a grammatical English sentence, OR
2. Provide an accurate Chinese translation of the word.

Strip the markdown fences and return ONLY valid JSON: {"correct":true/false,"comment":"your response"}`;

export async function POST(req: NextRequest) {
  return withErrorHandling("vocab-challenge.evaluate", async () => {
    const { word, answer } = await req.json() as { word: string; answer: string };

    if (!word?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: "word and answer required" }, { status: 400 });
    }

    const userPrompt = `Word: "${word}"\nStudent's answer: "${answer.trim()}"`;

    let raw: string;
    try {
      raw = await callOpenRouter(userPrompt, SYSTEM_PROMPT);
    } catch {
      return NextResponse.json({ error: "AI unavailable" }, { status: 502 });
    }

    const json = raw.replace(/^```(?:json)?\s*/,"").replace(/\s*```$/,"").trim();

    let result: { correct: boolean; comment: string };
    try {
      result = JSON.parse(json) as { correct: boolean; comment: string };
    } catch {
      return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 });
    }

    return NextResponse.json({
      correct: Boolean(result.correct),
      comment: String(result.comment ?? ""),
    });
  });
}
