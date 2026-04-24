import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface AmapGeocodeResponse {
  status: string;
  geocodes?: Array<{
    formatted_address: string;
    location: string; // "lng,lat"
  }>;
}

export async function GET(req: NextRequest) {
  return withErrorHandling("geocode", async () => {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as Record<string, string>;
    const apiKey = e.AMAP_API_KEY || process.env.AMAP_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AMAP_API_KEY not configured" }, { status: 503 });

    const address = req.nextUrl.searchParams.get("address")?.trim();
    if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

    const url = new URL("https://restapi.amap.com/v3/geocode/geo");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("address", address);
    url.searchParams.set("output", "json");

    let data: AmapGeocodeResponse;
    try {
      const res = await fetch(url.toString());
      if (!res.ok) return NextResponse.json({ error: "Geocode request failed" }, { status: 502 });
      data = await res.json() as AmapGeocodeResponse;
    } catch {
      return NextResponse.json({ error: "Geocode unavailable" }, { status: 502 });
    }

    const hit = data.geocodes?.[0];
    if (!hit?.location) return NextResponse.json({ error: "Address not found" }, { status: 404 });

    const [lng, lat] = hit.location.split(",").map(Number);
    return NextResponse.json({
      lat,
      lng,
      formattedAddress: hit.formatted_address,
    });
  });
}
