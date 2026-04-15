import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { callOpenRouter } from "@/lib/llm";


type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  return withAuth(async (userId) => {
    const { id } = await params;
    const { text } = await req.json() as { text: string };

    if (!text?.trim()) {
      return NextResponse.json({ error: "Text required" }, { status: 400 });
    }
    if (text.length > 10_000) {
      return NextResponse.json({ error: "Text too long (max 10 000 chars)" }, { status: 400 });
    }

    const db = await getDB();
    const list = await db
      .prepare("SELECT owner_id, secondary_label FROM lists WHERE id = ?")
      .bind(id)
      .first<{ owner_id: string; secondary_label: string | null }>();

    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (list.owner_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const secondaryField = list.secondary_label
      ? `"secondary": "${list.secondary_label} if present (string, optional)"`
      : `"secondary": "brand, address, artist, author, or other secondary info (string, optional)"`;

    const systemPrompt = `You are a data-extraction assistant. Extract every recommendation from the text below and return ONLY a JSON object — no prose, no markdown fences.

Required output shape:
{
  "items": [
    {
      "name": "exact name of the recommendation (string, required)",
      ${secondaryField},
      "reason": "why it is recommended, max 100 chars (string, optional)",
      "imageUrls": ["only URLs that literally appear in the source text (array of strings, optional)"]
    }
  ]
}

Rules:
1. Extract EVERY distinct recommendation — do not skip any.
2. For imageUrls, collect all image URLs that are written in the source (e.g. after "Images:", in markdown image syntax, or as plain https:// links). Include up to 3 per item.
3. Omit any optional field when no value exists — never use empty strings or empty arrays.
4. Output ONLY the raw JSON object. No explanation. No markdown. No code fences.`;

    let raw: string;
    try {
      raw = await callOpenRouter(text, systemPrompt);
    } catch (err) {
      console.error("OpenRouter call failed", err);
      return NextResponse.json({ error: "AI call failed" }, { status: 502 });
    }

    // Strip markdown code fences that some models add despite being told not to
    const jsonStr = raw
      .replace(/^```(?:json|JSON)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    let parsed: { items?: unknown[] };
    try {
      parsed = JSON.parse(jsonStr) as { items?: unknown[] };
    } catch {
      console.error("AI JSON parse failed. Raw response:", raw);
      return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 500 });
    }

    const items = (parsed.items ?? [])
      .filter(
        (i): i is Record<string, unknown> =>
          typeof i === "object" && i !== null && typeof (i as Record<string, unknown>).name === "string"
      )
      .map((i) => ({
        name:      String(i.name      ?? "").trim(),
        secondary: String(i.secondary ?? "").trim() || null,
        reason:    String(i.reason    ?? "").trim() || null,
        imageUrls: Array.isArray(i.imageUrls)
          ? (i.imageUrls as unknown[]).filter((u): u is string => typeof u === "string" && u.startsWith("http")).slice(0, 3)
          : [],
      }))
      .filter((i) => i.name.length > 0);

    return NextResponse.json({ items });
  });
}
