// ─────────────────────────────────────────────────────────────────────────────
// Short story shown in the 📖 reader FAB.
//
// PLACEHOLDER CONTENT — swap `title`, `author`, and `paragraphs` for the real
// story whenever you're ready. Keep each paragraph as one string in the array;
// highlights anchor to a paragraph index + character offsets, so re-ordering or
// editing paragraphs after people have highlighted may shift existing marks.
// Bumping `id` starts a fresh set of highlights (old ones stay in the DB, just
// hidden), which is the clean way to publish a revised story.
// ─────────────────────────────────────────────────────────────────────────────

export type Story = {
  id: string;
  title: string;
  author?: string;
  paragraphs: string[];
};

export const STORY: Story = {
  id: "placeholder-v1",
  title: "狼和羊的小夜曲",
  author: "咩咩 & 嗷呜",
  paragraphs: [
    "从前有一只狼，住在山的这一边；还有一只羊，住在山的那一边。他们本来不该认识的——狼太快，羊太慢；狼太吵，羊太轻。可是有一天夜里，风把羊的一声咩咩，吹过了整座山。",
    "狼竖起耳朵，愣了很久。那声音又软又暖，像是有人在很远的地方，轻轻叫了他一下。他没有去追，只是坐下来，把尾巴卷在脚边，等着下一声。",
    "羊也听见了回音——那是一声长长的嗷呜，落在夜里，像月亮掉进了湖里。羊本该害怕的，可她一点也不怕。她想，一个愿意把叫声放这么轻的狼，大概心里也藏着一片草地吧。",
    "于是他们开始隔着山说话。狼把想说的话嗷呜给风，羊把想说的话咩咩给夜。风来回跑了很多趟，跑瘦了，也跑甜了。他们从没见过面，却已经把彼此的声音，认成了回家的路。",
    "很多年以后，有人问那只狼：你不后悔吗，爱上一只你追不到的羊？狼笑了笑，说：我从来不是想追上她。我只是想，每天夜里，都还能听见她那一声咩咩，然后我回一声嗷呜，让她知道——我还在。",
    "这就是山这边的狼，和山那边的羊。他们没有结局，因为他们根本不需要结局。他们只需要，风还在吹，夜还很长，而彼此的声音，永远在半路上相遇。",
  ],
};
