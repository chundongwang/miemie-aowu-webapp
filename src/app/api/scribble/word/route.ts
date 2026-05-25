import { NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/llm";
import { pickRandomWord } from "@/lib/ielts-words";
import { withAuth } from "@/lib/api";

function parseSentence(raw: string): { sentence_en: string; sentence_zh: string } | null {
  try {
    const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(json) as { sentence_en: string; sentence_zh: string };
    const en = String(parsed.sentence_en ?? "").trim();
    const zh = String(parsed.sentence_zh ?? "").trim();
    if (!en || !zh) return null;
    return { sentence_en: en, sentence_zh: zh };
  } catch {
    return null;
  }
}

export async function GET() {
  return withAuth(async () => {
    const word = pickRandomWord();

    try {
      const raw = await callOpenRouter(
        `Word: "${word}"`,
        `You are an English-Chinese bilingual teacher. Given an IELTS vocabulary word, provide:
1. A natural English sentence that uses the word correctly at an IELTS level.
2. A Simplified Chinese translation of that sentence.

Return ONLY valid JSON, no markdown:
{"sentence_en": "...", "sentence_zh": "..."}`
      );

      const result = parseSentence(raw);
      if (result) {
        return NextResponse.json({ word, ...result });
      }
    } catch {
      // LLM call failed — fall through to word-only response
    }

    return NextResponse.json({
      word,
      sentence_en: null,
      sentence_zh: null,
    });
  });
}