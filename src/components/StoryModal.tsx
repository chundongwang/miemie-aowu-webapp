"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { STORY } from "@/lib/story";
import type { StoryHighlight, StoryHighlightComment } from "@/types";

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

    const quote = (STORY.paragraphs[paraIndex] ?? "").slice(start, end);
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
    <div className="fixed inset-0 z-[60] bg-[#faf6ef] dark:bg-gray-950 flex flex-col" role="dialog" aria-modal="true">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] border-b border-black/5 dark:border-white/10 bg-[#faf6ef]/90 dark:bg-gray-950/90 backdrop-blur">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{STORY.title}</span>
        <button
          onClick={onClose}
          aria-label={t.close}
          className="ml-3 shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
        >
          ✕
        </button>
      </header>

      {/* Reader */}
      <div className="flex-1 overflow-y-auto overscroll-contain" onScroll={() => setSel(null)}>
        <article
          ref={readerRef}
          className="max-w-prose mx-auto px-6 py-8 font-serif"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50 leading-snug mb-1">
            {STORY.title}
          </h1>
          {STORY.author && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 font-sans">{STORY.author}</p>
          )}

          {loading ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm font-sans">{t.loading}</p>
          ) : (
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-6 font-sans italic">{t.hint}</p>
              <div className="space-y-5 text-[1.05rem] leading-[1.9] text-gray-800 dark:text-gray-200">
                {STORY.paragraphs.map((para, i) => (
                  <p key={i} data-para-index={i}>
                    {renderParagraph(para, i)}
                  </p>
                ))}
              </div>
            </>
          )}
          <div className="h-24" />
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
