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
  "名人",
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
- 答案必须容易画 —— 具体可视化的事物，不要抽象概念。
- 普通人能猜出来 —— 难度中等偏易。
- 答案不能包含在 guesserClue 里（一字也不能出现）。
- 不要使用 emoji。
- 不同次生成尽量换不同的类别和不同的答案，提高趣味性。`;

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
