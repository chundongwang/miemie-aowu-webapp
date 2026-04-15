import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Search Google Images via Serper and return candidate URLs (best-first).
 * Returns [] if SERPER_API_KEY is not configured or the call fails.
 */
export async function searchImages(query: string, limit = 5): Promise<string[]> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, string>;
  const apiKey = e.SERPER_API_KEY || process.env.SERPER_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: limit }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { images?: Array<{ imageUrl: string }> };
    return (data.images ?? []).map((i) => i.imageUrl).filter(Boolean);
  } catch {
    return [];
  }
}
