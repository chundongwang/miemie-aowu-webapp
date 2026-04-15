import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/llm";
import { professorPrompt, parseEval } from "@/lib/professor";
import { withErrorHandling } from "@/lib/api";


export async function POST(req: NextRequest) {
  return withErrorHandling("vocab-challenge.evaluate", async () => {
    const { word, answer, locale = "en" } = await req.json() as {
      word: string; answer: string; locale?: string;
    };

    if (!word?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: "word and answer required" }, { status: 400 });
    }

    let raw: string;
    try {
      raw = await callOpenRouter(
        `Word: "${word}"\nStudent's answer: "${answer.trim()}"`,
        professorPrompt(locale)
      );
    } catch {
      return NextResponse.json({ error: "AI unavailable" }, { status: 502 });
    }

    try {
      return NextResponse.json(parseEval(raw));
    } catch {
      return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 });
    }
  });
}
