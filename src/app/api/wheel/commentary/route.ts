import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api";
import { callOpenRouter } from "@/lib/llm";
import { getLunarContext } from "@/lib/lunar";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(req: NextRequest) {
  return withErrorHandling("wheel.commentary", async () => {
    const { food, location } = await req.json() as {
      food: { zh: string; en: string; emoji: string };
      location?: { lat: number; lng: number } | null;
    };

    if (!food?.zh) return NextResponse.json({ error: "food required" }, { status: 400 });

    // Lunar context — pure computation, no API
    const lunar = getLunarContext();

    // Weather — Amap 2-step, best-effort
    let weatherLine = "";
    if (location?.lat && location?.lng) {
      try {
        const { env } = await getCloudflareContext({ async: true });
        const e = env as unknown as Record<string, string>;
        const amapKey = e.AMAP_API_KEY || process.env.AMAP_API_KEY;
        if (amapKey) {
          const regeoRes = await fetch(
            `https://restapi.amap.com/v3/geocode/regeo?location=${location.lng},${location.lat}&key=${amapKey}&extensions=base`
          );
          const regeo = await regeoRes.json() as {
            status: string;
            regeocode?: { addressComponent?: { adcode?: string; city?: string } };
          };
          const adcode = regeo.regeocode?.addressComponent?.adcode;
          const city = regeo.regeocode?.addressComponent?.city || "";
          if (adcode) {
            const wxRes = await fetch(
              `https://restapi.amap.com/v3/weather/weatherInfo?city=${adcode}&key=${amapKey}&extensions=base`
            );
            const wx = await wxRes.json() as {
              status: string;
              lives?: Array<{ weather: string; temperature: string; winddirection: string; windpower: string }>;
            };
            const live = wx.lives?.[0];
            if (live) {
              weatherLine = `当前天气：${city}${live.weather}，气温${live.temperature}°C，${live.winddirection}风${live.windpower}级`;
            }
          }
        }
      } catch { /* weather is optional — silently skip */ }
    }

    const lunarLine = lunar.jieqi
      ? `今天是${lunar.lunarDate}，正值${lunar.jieqi}`
      : `今天是${lunar.lunarDate}，距下一个节气${lunar.nextJieqi}（${lunar.nextJieqiDate}）还有几天`;

    const userPrompt = [
      `今天想吃：${food.emoji} ${food.zh}（${food.en}）`,
      weatherLine || null,
      lunarLine,
    ].filter(Boolean).join("\n");

    const systemPrompt = `你是用户贴心的男朋友。你温柔、体贴、懂生活，对中国美食文化和历史典故了如指掌。
请根据以下信息，用中文写一段温暖的推荐语（3-4句话，不超过120字）。

要求：
- 语气甜蜜体贴，像真实的男友在关心伴侣
- 自然融入天气和节气信息，让推荐更有生活感
- 如果这道菜有著名的历史人物、文人墨客或当代名人与之有趣的渊源或典故，自然地提一句（一句话即可）
- 整体流畅自然，不要生硬堆砌信息
- 直接输出文字，不要任何格式标记、引号或额外说明`;

    const text = (await callOpenRouter(userPrompt, systemPrompt))
      .trim()
      .replace(/^["'"「【]|["'"」】]$/g, "");

    return NextResponse.json({ text });
  });
}
