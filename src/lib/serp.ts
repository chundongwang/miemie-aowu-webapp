import { getCloudflareContext } from "@opennextjs/cloudflare";

export type SerpImageResult = {
  imageUrl: string;
  thumbnailUrl: string;
  title: string;
  source: string;
};

/**
 * Search Google Images via Serper.
 * Returns [] if SERPER_API_KEY is not configured or the call fails.
 */
export async function searchImages(query: string, limit = 8): Promise<SerpImageResult[]> {
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
    const data = await res.json() as {
      images?: Array<{
        imageUrl?: string;
        thumbnailUrl?: string;
        title?: string;
        source?: string;
      }>;
    };
    return (data.images ?? [])
      .filter((i) => i.imageUrl)
      .map((i) => ({
        imageUrl:    i.imageUrl!,
        thumbnailUrl: i.thumbnailUrl ?? i.imageUrl!,
        title:       i.title  ?? "",
        source:      i.source ?? "",
      }));
  } catch {
    return [];
  }
}
