"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { STORY } from "@/lib/story";
import type { StoryHighlight, StoryHighlightComment } from "@/types";

// Plain text of a block by index ("" for scene breaks). Highlights anchor to
// a block index + char offsets into this text.
function blockText(i: number): string {
  const b = STORY.blocks[i];
  return b && b.type !== "break" ? b.text : "";
}

const PROGRESS_KEY = `story-progress-${STORY.id}`;

// Faithful port of the source HTML's typography: paper card, indented justified
// paragraphs, tinted/bordered "system" fields, centered scene breaks. Scoped to
// .sr-reader; theme-aware via prefers-color-scheme (matches the app's dark mode).
const READER_CSS = `
.sr-reader {
  --sr-page:#f7f4ed; --sr-paper:#fffdf8; --sr-ink:#242321;
  --sr-muted:#77726a; --sr-rule:#d8d2c7; --sr-system-bg:#f1eee7; --sr-system-ink:#393632;
  background:var(--sr-page);
}
@media (prefers-color-scheme: dark) {
  .sr-reader {
    --sr-page:#171614; --sr-paper:#1d1c19; --sr-ink:#e9e4da;
    --sr-muted:#a9a298; --sr-rule:#423e38; --sr-system-bg:#25231f; --sr-system-ink:#ded7cc;
  }
}
.sr-header { background:color-mix(in srgb, var(--sr-page) 92%, transparent); border-bottom:1px solid var(--sr-rule); }
.sr-header-title { color:var(--sr-muted); }
.sr-article {
  width:min(760px,calc(100% - 36px)); margin:42px auto 96px; padding:56px 60px 72px;
  background:var(--sr-paper); box-shadow:0 12px 44px rgba(42,37,29,.08); color:var(--sr-ink);
  font-family:"Source Han Serif SC","Noto Serif CJK SC","Songti SC","STSong","SimSun",serif;
}
.sr-h1 { margin:0 0 12px; text-align:center; font-size:clamp(28px,5vw,40px); line-height:1.25; letter-spacing:.16em; font-weight:600; }
.sr-hint { text-align:center; color:var(--sr-muted); font-size:12px; font-style:italic; margin:0 0 48px; }
.sr-p {
  margin:0 0 .86em; font-size:18px; line-height:1.95; text-align:justify;
  text-justify:inter-ideograph; text-indent:2em; hanging-punctuation:first allow-end last;
}
.sr-break { margin:2.7em 0 2.5em; text-align:center; color:var(--sr-muted); font-size:16px; letter-spacing:.28em; }
.sr-system {
  margin:.42em auto; padding:.54em .9em; max-width:92%;
  border-left:2px solid var(--sr-rule); background:var(--sr-system-bg); color:var(--sr-system-ink);
  font-family:"SFMono-Regular","Cascadia Mono","Roboto Mono","Noto Sans Mono CJK SC",monospace;
  font-size:14px; line-height:1.7; letter-spacing:.02em; overflow-wrap:anywhere;
}
.sr-p mark, .sr-system mark { color:inherit; }
@media (max-width:680px) {
  .sr-article { width:100%; margin:0; padding:40px 22px 64px; box-shadow:none; }
  .sr-hint { margin-bottom:36px; }
  .sr-p { font-size:17px; line-height:1.9; }
  .sr-system { max-width:100%; font-size:13px; }
}
`;

const COPY = {
  en: {
    close: "Close",
    hint: "Select any text to highlight it and leave a note.",
    comment: "Comment",
    notePlaceholder: "Add a note (optional)…",
    replyPlaceholder: "Write a reply…",
    saveHighlight: "Save highlight",
    post: "Post",
    posting: "…",
    delete: "Delete highlight",
    noNotes: "No notes yet — start the thread.",
    highlightBy: "Highlighted by",
    loading: "Loading…",
  },
  zh: {
    close: "关闭",
    hint: "选中任意文字，就能高亮并留言。",
    comment: "评论",
    notePlaceholder: "写点想法（可选）…",
    replyPlaceholder: "回复一句…",
    saveHighlight: "保存高亮",
    post: "发送",
    posting: "…",
    delete: "删除高亮",
    noNotes: "还没有留言 —— 来说第一句吧。",
    highlightBy: "高亮者",
    loading: "加载中…",
  },
} as const;

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 45%, 55%)`;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Character offset of (node, offset) measured from the start of `container`'s text.
function offsetWithin(container: Node, node: Node, offset: number): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let cur = walker.nextNode();
  while (cur) {
    if (cur === node) return total + offset;
    total += cur.textContent?.length ?? 0;
    cur = walker.nextNode();
  }
  return total;
}

type PendingSel = { paraIndex: number; start: number; end: number; quote: string; top: number; left: number };

export default function StoryModal({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  const t = COPY[locale] ?? COPY.en;

  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [me, setMe] = useState<{ id: string; displayName: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [sel, setSel] = useState<PendingSel | null>(null);
  // Bottom sheet: either composing a note on a new selection, or viewing a thread.
  const [sheet, setSheet] = useState<
    | { type: "new"; paraIndex: number; start: number; end: number; quote: string }
    | { type: "thread"; highlightId: string }
    | null
  >(null);

  const [noteDraft, setNoteDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const readerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  // ── Remember reading progress (per-device, per-story) ───────────────────────
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = Number(localStorage.getItem(PROGRESS_KEY));
    if (saved > 0) el.scrollTop = saved;
  }, []);

  function onReaderScroll() {
    setSel(null); // stale toolbar position once the page moves
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollRef.current;
      if (el) localStorage.setItem(PROGRESS_KEY, String(Math.round(el.scrollTop)));
    });
  }

  // ── Load highlights + current user ──────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [hls, user] = await Promise.all([
        fetch(`/api/story/${STORY.id}/highlights`).then((r) => (r.ok ? r.json() : [])) as Promise<StoryHighlight[]>,
        fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)) as Promise<{ id: string; displayName: string } | null>,
      ]);
      if (!alive) return;
      setHighlights(hls);
      setMe(user);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // ── Track text selection → floating toolbar ─────────────────────────────────
  const refreshSelection = useCallback(() => {
    const container = readerRef.current;
    if (!container) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setSel(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setSel(null);
      return;
    }
    const startEl =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : (range.startContainer as Element);
    const paraEl = startEl?.closest<HTMLElement>("[data-para-index]");
    if (!paraEl) { setSel(null); return; }

    const paraIndex = Number(paraEl.dataset.paraIndex);
    const a = offsetWithin(paraEl, range.startContainer, range.startOffset);
    const b = paraEl.contains(range.endContainer)
      ? offsetWithin(paraEl, range.endContainer, range.endOffset)
      : (paraEl.textContent?.length ?? a);
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    if (end <= start) { setSel(null); return; }

    const quote = blockText(paraIndex).slice(start, end);
    if (!quote.trim()) { setSel(null); return; }

    const rect = range.getBoundingClientRect();
    setSel({
      paraIndex,
      start,
      end,
      quote,
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshSelection);
    return () => document.removeEventListener("selectionchange", refreshSelection);
  }, [refreshSelection]);

  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    setSel(null);
  }

  // ── Mutations ───────────────────────────────────────────────────────────────
  async function createHighlight() {
    if (sheet?.type !== "new" || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/story/${STORY.id}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paraIndex: sheet.paraIndex,
          startOffset: sheet.start,
          endOffset: sheet.end,
          quote: sheet.quote,
          body: noteDraft.trim() || undefined,
        }),
      });
      if (res.ok) {
        const hl = (await res.json()) as StoryHighlight;
        setHighlights((prev) => [...prev, hl]);
        setNoteDraft("");
        setSheet(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function postReply(highlightId: string) {
    if (!replyDraft.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/story/highlights/${highlightId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyDraft.trim() }),
      });
      if (res.ok) {
        const c = (await res.json()) as StoryHighlightComment;
        setHighlights((prev) =>
          prev.map((h) => (h.id === highlightId ? { ...h, comments: [...h.comments, c] } : h))
        );
        setReplyDraft("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteHighlight(highlightId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/story/highlights/${highlightId}`, { method: "DELETE" });
      if (res.ok) {
        setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
        setSheet(null);
      }
    } finally {
      setBusy(false);
    }
  }

  // ── Render a paragraph, weaving in <mark> spans for its highlights ───────────
  function renderParagraph(text: string, paraIndex: number) {
    const paraHls = highlights
      .filter((h) => h.paraIndex === paraIndex)
      .sort((a, b) => a.startOffset - b.startOffset);

    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    paraHls.forEach((h, i) => {
      const s = Math.max(cursor, Math.min(h.startOffset, text.length));
      const e = Math.max(s, Math.min(h.endOffset, text.length));
      if (s > cursor) nodes.push(<span key={`p${i}`}>{text.slice(cursor, s)}</span>);
      if (e > s) {
        const hasNotes = h.comments.length > 0;
        nodes.push(
          <mark
            key={h.id}
            onClick={() => { clearSelection(); setSheet({ type: "thread", highlightId: h.id }); }}
            className={`cursor-pointer rounded px-0.5 transition-colors ${
              hasNotes
                ? "bg-amber-200/80 dark:bg-amber-400/30 underline decoration-amber-500/60 decoration-dotted underline-offset-4"
                : "bg-amber-100/80 dark:bg-amber-400/15"
            } text-inherit`}
          >
            {text.slice(s, e)}
          </mark>
        );
      }
      cursor = Math.max(cursor, e);
    });
    if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
    return nodes;
  }

  const activeThread =
    sheet?.type === "thread" ? highlights.find((h) => h.id === sheet.highlightId) ?? null : null;

  return (
    <div className="sr-reader fixed inset-0 z-[60] flex flex-col" role="dialog" aria-modal="true">
      <style>{READER_CSS}</style>

      {/* Header */}
      <header className="sr-header shrink-0 flex items-center justify-between px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
        <span className="sr-header-title text-sm font-medium truncate">{STORY.title}</span>
        <button
          onClick={onClose}
          aria-label={t.close}
          className="ml-3 shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
        >
          ✕
        </button>
      </header>

      {/* Reader */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        onScroll={onReaderScroll}
      >
        <article ref={readerRef} className="sr-article" style={{ WebkitTapHighlightColor: "transparent" }}>
          <h1 className="sr-h1">{STORY.title}</h1>
          {STORY.author && <p className="sr-hint" style={{ marginBottom: 8 }}>{STORY.author}</p>}
          <p className="sr-hint">{loading ? t.loading : t.hint}</p>

          {STORY.blocks.map((b, i) => {
            if (b.type === "break") {
              return <div key={i} className="sr-break" aria-hidden="true">·&nbsp;&nbsp;·&nbsp;&nbsp;·</div>;
            }
            const cls = b.type === "system" ? "sr-system" : "sr-p";
            return (
              <div key={i} className={cls} data-para-index={i}>
                {renderParagraph(b.text, i)}
              </div>
            );
          })}
        </article>
      </div>

      {/* Floating selection toolbar */}
      {sel && !sheet && (
        <button
          onClick={() => {
            setNoteDraft("");
            setSheet({ type: "new", paraIndex: sel.paraIndex, start: sel.start, end: sel.end, quote: sel.quote });
          }}
          className="fixed z-[70] -translate-x-1/2 -translate-y-full flex items-center gap-1.5 rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium px-3.5 py-2 shadow-xl active:scale-95 transition-transform"
          style={{ top: Math.max(sel.top - 10, 56), left: Math.min(Math.max(sel.left, 70), window.innerWidth - 70) }}
        >
          <span>🖍️</span>
          {t.comment}
        </button>
      )}

      {/* Bottom sheet: new-highlight note composer */}
      {sheet?.type === "new" && (
        <Sheet onClose={() => setSheet(null)}>
          <Quote text={sheet.quote} />
          <textarea
            value={noteDraft}
            autoFocus
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder={t.notePlaceholder}
            rows={3}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-2xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]/30 focus:border-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={createHighlight}
              disabled={busy}
              className="bg-[#2B4B8C] text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-[#1e3a70] disabled:opacity-40 transition-colors"
            >
              {busy ? t.posting : t.saveHighlight}
            </button>
          </div>
        </Sheet>
      )}

      {/* Bottom sheet: existing highlight thread */}
      {activeThread && (
        <Sheet onClose={() => setSheet(null)}>
          <Quote text={activeThread.quote} />
          <p className="text-[11px] text-gray-400 dark:text-gray-500 -mt-1">
            {t.highlightBy} {activeThread.authorName}
          </p>

          <div className="max-h-[38vh] overflow-y-auto space-y-3">
            {activeThread.comments.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-xs">{t.noNotes}</p>
            ) : (
              activeThread.comments.map((c) => (
                <div key={c.id} className="flex gap-2 items-start">
                  <div
                    className="mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ backgroundColor: avatarColor(c.authorName) }}
                  >
                    {c.authorName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 rounded-2xl px-3.5 py-2">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-semibold text-xs text-gray-700 dark:text-gray-200">{c.authorName}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2 items-end">
            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postReply(activeThread.id);
              }}
              placeholder={t.replyPlaceholder}
              rows={1}
              className="flex-1 border border-gray-200 dark:border-gray-700 rounded-2xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]/30 focus:border-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 resize-none"
            />
            <button
              onClick={() => postReply(activeThread.id)}
              disabled={busy || !replyDraft.trim()}
              className="shrink-0 bg-[#2B4B8C] text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40 transition-colors"
            >
              {busy ? t.posting : t.post}
            </button>
          </div>

          {me && activeThread.userId === me.id && (
            <button
              onClick={() => deleteHighlight(activeThread.id)}
              disabled={busy}
              className="text-xs text-red-500/80 hover:text-red-500 disabled:opacity-40 self-start"
            >
              {t.delete}
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}

// ── Bottom sheet shell ─────────────────────────────────────────────────────────
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-[71] bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-w-lg mx-auto space-y-3">
        <div className="mx-auto h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700 mb-1" />
        {children}
      </div>
    </>
  );
}

function Quote({ text }: { text: string }) {
  return (
    <blockquote className="border-l-2 border-amber-400 pl-3 text-sm text-gray-600 dark:text-gray-300 italic max-h-24 overflow-y-auto">
      “{text}”
    </blockquote>
  );
}
