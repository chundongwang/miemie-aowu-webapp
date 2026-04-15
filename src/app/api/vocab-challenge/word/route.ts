import { NextResponse } from "next/server";
import { pickRandomWord } from "@/lib/ielts-words";
import { withErrorHandling } from "@/lib/api";

export async function GET() {
  return withErrorHandling("vocab-challenge.word", async () => {
    return NextResponse.json({ word: pickRandomWord() });
  });
}
