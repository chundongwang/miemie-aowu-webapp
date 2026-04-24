import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface AmapPoi {
  id: string;
  name: string;
  address: string | string[];
  location: string; // "lng,lat"
  distance: string;
  tel: string;
  biz_ext?: {
    rating?: string;
    cost?: string;
    open_time?: string;
  };
}

interface AmapResponse {
  status: string;
  pois?: AmapPoi[];
}

export async function GET(req: NextRequest) {
  return withErrorHandling("search-food", async () => {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as Record<string, string>;
    const apiKey = e.AMAP_API_KEY || process.env.AMAP_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AMAP_API_KEY not configured" }, { status: 503 });

    const { searchParams } = req.nextUrl;
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const keywords = searchParams.get("keywords")?.trim() || "餐厅";
    const radius = Math.min(Number(searchParams.get("radius") ?? 2000), 50000);

    if (!lat || !lng) return NextResponse.json({ error: "lat and lng required" }, { status: 400 });

    const url = new URL("https://restapi.amap.com/v3/place/around");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("location", `${lng},${lat}`); // Amap uses lng,lat order
    url.searchParams.set("keywords", keywords);
    url.searchParams.set("types", "050000"); // all dining services
    url.searchParams.set("radius", String(radius));
    url.searchParams.set("extensions", "all");
    url.searchParams.set("output", "json");
    url.searchParams.set("offset", "20");
    url.searchParams.set("page", "1");

    let data: AmapResponse;
    try {
      const res = await fetch(url.toString());
      if (!res.ok) return NextResponse.json({ error: "Amap request failed" }, { status: 502 });
      data = await res.json() as AmapResponse;
    } catch {
      return NextResponse.json({ error: "Amap unavailable" }, { status: 502 });
    }

    if (data.status !== "1") {
      return NextResponse.json({ results: [] });
    }

    const results = (data.pois ?? []).map((p) => {
      const [pLng, pLat] = (p.location || "").split(",").map(Number);
      return {
        id: p.id,
        name: p.name,
        address: Array.isArray(p.address) ? p.address.join("") : (p.address || ""),
        lat: pLat || 0,
        lng: pLng || 0,
        distance: Number(p.distance) || 0,
        rating: p.biz_ext?.rating || "",
        cost: p.biz_ext?.cost || "",
        tel: p.tel || "",
        openTime: p.biz_ext?.open_time || "",
      };
    });

    return NextResponse.json({ results });
  });
}
