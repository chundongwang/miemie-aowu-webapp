import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api";
import { callOpenRouter } from "@/lib/llm";
import { getLunarContext } from "@/lib/lunar";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuthUserId } from "@/lib/auth";
import { getDB } from "@/lib/db";

export async function POST(req: NextRequest) {
  return withErrorHandling("wheel.commentary", async () => {
    const { food, location } = await req.json() as {
      food: { zh: string; en: string; emoji: string };
      location?: { lat: number; lng: number } | null;
    };

    if (!food?.zh) return NextResponse.json({ error: "food required" }, { status: 400 });

    // Preferred display name — best-effort, falls back gracefully
    let displayName = "";
    try {
      const userId = await getAuthUserId();
      if (userId) {
        const db = await getDB();
        const row = await db.prepare("SELECT display_name FROM users WHERE id = ?").bind(userId).first<{ display_name: string }>();
        displayName = row?.display_name ?? "";
      }
    } catch { /* non-critical */ }

    // Lunar context — pure computation, no API
    const lunar = getLunarContext();

    // Local time at the location — Amap covers China only, so Asia/Shanghai is always correct
    function getLocalTimeLine(tz = "Asia/Shanghai"): string {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("zh-CN", {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
      const m = parts.find((p) => p.type === "minute")?.value ?? "00";
      const period =
        h >= 23 || h < 5  ? "深夜"
        : h < 8           ? "凌晨"
        : h < 11          ? "上午"
        : h < 13          ? "中午"
        : h < 17          ? "下午"
        : h < 19          ? "傍晚"
                          : "晚上";
      return `当前本地时间：${period} ${h}:${m}`;
    }

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
              const timeLine = getLocalTimeLine();
              weatherLine = `${timeLine}\n当前天气：${city}${live.weather}，气温${live.temperature}°C，${live.winddirection}风${live.windpower}级`;
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

    const nameClause = displayName ? `用户的名字叫"${displayName}"，可以自然地叫她。` : "";
    const systemPrompt = `你是一个活泼有趣、懂吃懂生活的好朋友，对中国美食文化和历史典故了如指掌。${nameClause ? "\n" + nameClause : ""}
请根据以下信息，用中文写一段轻快愉悦的推荐语（3-4句话，不超过120字）。

要求：
- 语气轻松愉快、有活力，像朋友聊天一样自然，不要肉麻
- 结合当前时间和天气，给出一两句具体实用的小提示（例如：下雨天配热汤更治愈，大热天记得冰饮配着，宵夜别太撑等）
- 自然带上节气信息，增添一点生活情趣
- 如果这道菜有有趣的历史人物或典故，轻描淡写提一句
- 整体流畅自然，不堆砌，读起来让人开心想立刻去吃
- 直接输出文字，不要任何格式标记、引号或额外说明`;

    const text = (await callOpenRouter(userPrompt, systemPrompt))
      .trim()
      .replace(/^["'"「【]|["'"」】]$/g, "");

    return NextResponse.json({ text });
  });
}
