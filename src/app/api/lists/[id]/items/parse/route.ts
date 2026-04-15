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

    const secondaryLine = list.secondary_label
      ? `- secondary: the ${list.secondary_label} if mentioned (optional)`
      : `- secondary: secondary info such as location, artist, author, or creator (optional)`;

    const systemPrompt = `You extract recommendation items from free-form text.
Return ONLY valid JSON in this exact shape: {"items":[{"name":"...","secondary":"...","reason":"...","imageUrls":["..."]}]}
Rules:
- name: the name of the recommended item — required, concise
${secondaryLine}
- reason: brief reason or note (optional, max 100 chars)
- imageUrls: array of image URLs explicitly present in the source text (e.g. markdown ![alt](url) or bare https:// links); max 3 per item; only include URLs actually in the text
- Extract every distinct recommendation you can find
- Omit a field entirely if it has no value (do not use empty strings or empty arrays)
- Output only the JSON object, nothing else`;

    let raw: string;
    try {
      raw = await callOpenRouter(text, systemPrompt);
    } catch (err) {
      console.error("OpenRouter call failed", err);
      return NextResponse.json({ error: "AI call failed" }, { status: 502 });
    }

    let parsed: { items?: unknown[] };
    try {
      parsed = JSON.parse(raw) as { items?: unknown[] };
    } catch {
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
