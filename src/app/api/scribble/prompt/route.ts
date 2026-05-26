import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { withAuth } from "@/lib/api";
import { callOpenRouter } from "@/lib/llm";

// Curated category list. The LLM is told to pick ONE of these (or close
// variant) so the game stays focused on picture-friendly, broadly-known
// concepts. Order is irrelevant; we shuffle the list each call so the model
// doesn't gravitate to the first few entries.
const CATEGORIES = [
  "地方菜",
  "家电",
  "家具",
  "零食",
  "饮料",
  "虚构角色",
  "动物",
  "植物",
  "日用品",
  "品牌",
  "城市",
  "运动",
  "职业",
  "交通工具",
  "天气",
  "乐器",
  "服装",
  "电影/电视剧",
];

function shuffled<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type GeneratedPrompt = {
  category: string;
  word: string;
  drawerDescription: string;
  guesserClue: string;
};

function parseGenerated(raw: string): GeneratedPrompt | null {
  try {
    const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(json) as Partial<GeneratedPrompt>;
    if (
      typeof parsed.category === "string" && parsed.category.trim() &&
      typeof parsed.word === "string" && parsed.word.trim() &&
      typeof parsed.drawerDescription === "string" && parsed.drawerDescription.trim() &&
      typeof parsed.guesserClue === "string" && parsed.guesserClue.trim()
    ) {
      return {
        category: parsed.category.trim(),
        word: parsed.word.trim(),
        drawerDescription: parsed.drawerDescription.trim(),
        guesserClue: parsed.guesserClue.trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST() {
  return withAuth(async (userId) => {
    const categoryHint = shuffled(CATEGORIES).slice(0, 8).join("、");

    const systemPrompt = `你正在为一个画图猜词的中文小游戏出题。
游戏规则：画图玩家拿到一个词后用 75 秒画出来，猜词玩家根据画来猜。

请严格输出一个 JSON 对象（不要 markdown，不要解释）：
{
  "category": "类别（中文标签）",
  "word": "答案，简短具体的中文词（2-6 字）",
  "drawerDescription": "给画图玩家的描述：1 句话，帮他理解这个词是什么、怎么画",
  "guesserClue": "给猜词玩家的提示：1 句话，引导思路但不能直接说出答案"
}

硬性要求：
- 答案必须是具体可视化的事物或场景，能用画的方式表达（避免纯抽象概念）。
- 难度中等偏难，聪明人才能猜出来 —— 太显眼的答案（如"沙发"、"长颈鹿"、"向日葵"、"汽车"、"苹果"、"太阳"）不要出。
- 优先选择有趣、有特色、需要联想或留意细节的答案。各类别参考例子：
  · 地方菜：佛跳墙、锅包肉、重庆小面、煎饼果子、糖油粑粑
  · 家电：扫地机器人、加湿器、投影仪、洗碗机
  · 家具：榻榻米、飘窗、衣帽间
  · 零食 / 饮料：辣条、旺旺仙贝、北冰洋、王老吉、椰树椰汁
  · 虚构角色（动漫、影视、小说、游戏里的角色，不要真人名人）：孙悟空、哆啦A梦、灰太狼、葫芦娃、海绵宝宝、哈利波特
  · 动物：穿山甲、水豚、树懒、鸭嘴兽、犰狳
  · 植物：含羞草、捕蝇草、龟背竹
  · 日用品：指甲剪、鸡毛掸子、电蚊拍、痒痒挠
  · 品牌（要有视觉特征的标志或包装）：老干妈、海底捞、农夫山泉、旺仔牛奶
  · 城市（用代表性景观、地标或文化符号）：重庆、苏州、西安、青岛
  · 运动：攀岩、跳水、击剑、皮划艇
  · 职业：法医、空姐、消防员、调酒师、潜水员
  · 交通工具：高铁、摩托艇、滑板车、热气球
  · 天气：沙尘暴、龙卷风、冰雹、彩虹双拱
  · 乐器：古筝、二胡、唢呐、马林巴
  · 服装：旗袍、汉服、西装三件套、和服
  · 电影/电视剧：让子弹飞、流浪地球、武林外传、甄嬛传
- 不出真人名人，也不要纯文字概念（数学公式、网络抽象词等）。
- 答案不能在 guesserClue 里出现（一字也不能）。
- 不要使用 emoji。
- 不同次生成尽量换不同的类别和不同的答案，避免重复，提高趣味性。`;

    const userPrompt = `请生成一道新题目。建议从以下类别中挑一个（也可以选其他合适的类别）：${categoryHint}`;

    let generated: GeneratedPrompt | null = null;
    try {
      const raw = await callOpenRouter(userPrompt, systemPrompt, {
        temperature: 0.9,
        maxTokens: 400,
      });
      generated = parseGenerated(raw);
    } catch {
      // fall through to error response below
    }

    if (!generated) {
      return NextResponse.json({ error: "Failed to generate prompt" }, { status: 502 });
    }

    const db = await getDB();
    const promptId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO scribble_prompts (id, created_by, category, word, drawer_description, guesser_clue)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(promptId, userId, generated.category, generated.word, generated.drawerDescription, generated.guesserClue)
      .run();

    // Drawer gets the answer + drawer description. guesser_clue is NOT sent
    // here — the drawer doesn't need it and showing it would let the drawer
    // sanity-check their own clue, which isn't useful.
    return NextResponse.json({
      promptId,
      category: generated.category,
      word: generated.word,
      drawerDescription: generated.drawerDescription,
    });
  });
}
