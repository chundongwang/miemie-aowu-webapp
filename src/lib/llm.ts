import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function callOpenRouter(userPrompt: string, systemPrompt: string): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, string>;

  // In production: read from Cloudflare secrets (wrangler secret put)
  // In local dev:  fall back to process.env / .env.local
  const apiKey = e.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const model = e.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || "qwen/qwen-plus";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://miemieaowu.ai",
      "X-Title": "miemieaowu",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt  },
      ],
      // NOTE: response_format omitted — not universally supported across providers;
      // we rely on the system prompt instruction and strip fences in the caller.
      max_tokens: 2000,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? "{}";
}
