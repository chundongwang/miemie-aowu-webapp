"use client";

import { useEffect, useRef, useState } from "react";
import ScribbleReplay from "./ScribbleReplay";

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";
// Legacy 3-tier grade lives only on pre-scoring rows.
export type LegacyGrade = "exact" | "similar" | "wrong" | "revealed";

export type GuessHistoryItem = {
  // Server guessId once the LLM finishes; client-temporary id while pending.
  id: string;
  text: string;
  closeness: number | null;  // null while grading
  grade: Grade | null;       // null while grading
  timeUsedMs: number;
  createdAt: number;
};

export type InboxScribble = {
  id: string;
  kind: "prompt" | "idiom";
  category: string | null;
  guesserClue: string | null;
  word: string | null;
  drawerDescription: string | null;
  pinyin: string | null;
  explanation: string | null;
  imageUrl: string;
  recordingUrl: string | null;
  createdAt: number;
  viewedAt: number | null;
  // Legacy single-shot guess fields (only set for old idiom rows).
  guess: string | null;
  guessGrade: LegacyGrade | null;
  guessedAt: number | null;
  // New scoring fields:
  finalGrade: Grade | null;
  finished: boolean;
  timerMs: number;
  remainingMs: number;
  guesses: GuessHistoryItem[];
  senderName: string;
  senderUsername: string;
};

type Props = {
  scribbles: InboxScribble[];
  onClose: () => void;
  // Generic mutation handler so the modal can push partial updates back into
  // the parent state as the game progresses (viewedAt, new guesses, final).
  onUpdate: (id: string, partial: Partial<InboxScribble>) => void;
};

const CLUE_REVEAL_AT = 0.5;

// Per-grade visuals. S → A → B → C → D → F, going from celebratory to grim.
const GRADE_DISPLAY: Record<Grade, { color: string; ring: string; bg: string; subtitle: string }> = {
  S: { color: "text-yellow-300",  ring: "ring-yellow-300",  bg: "bg-yellow-300/10",  subtitle: "Legendary — exact + lightning fast!" },
  A: { color: "text-emerald-300", ring: "ring-emerald-300", bg: "bg-emerald-300/10", subtitle: "Excellent — nailed it." },
  B: { color: "text-blue-300",    ring: "ring-blue-300",    bg: "bg-blue-300/10",    subtitle: "Solid guess." },
  C: { color: "text-violet-300",  ring: "ring-violet-300",  bg: "bg-violet-300/10",  subtitle: "On the right track." },
  D: { color: "text-orange-300",  ring: "ring-orange-300",  bg: "bg-orange-300/10",  subtitle: "Direction was right, target was off." },
  F: { color: "text-gray-300",    ring: "ring-gray-500",    bg: "bg-gray-500/10",    subtitle: "Better luck next time." },
};

const LEGACY_DISPLAY: Record<LegacyGrade, { color: string; ring: string; title: string; subtitle: string }> = {
  exact:    { color: "text-yellow-300", ring: "ring-yellow-300", title: "完美!",     subtitle: "Exact match!" },
  similar:  { color: "text-green-300",  ring: "ring-green-300",  title: "意思接近!", subtitle: "Great guess — same idea!" },
  wrong:    { color: "text-gray-300",   ring: "ring-gray-500",   title: "差远了…",   subtitle: "Better luck next time" },
  revealed: { color: "text-gray-300",   ring: "ring-gray-500",   title: "看了答案",   subtitle: "下次试着猜猜看" },
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function ScribbleInboxModal({ scribbles, onClose, onUpdate }: Props) {
  // Stable order: newest first, regardless of guess state.
  const ordered = [...scribbles].sort((a, b) => b.createdAt - a.createdAt);

  // Start on the first unguessed scribble so the user lands on the new one.
  const [activeIndex, setActiveIndex] = useState(() => {
    const sorted = [...scribbles].sort((a, b) => b.createdAt - a.createdAt);
    const i = sorted.findIndex((s) => !s.finished && s.guessGrade === null);
    return i === -1 ? 0 : i;
  });
  const active = ordered[activeIndex];

  const [guessInput, setGuessInput] = useState("");
  const [error, setError] = useState("");
  const [clueRevealed, setClueRevealed] = useState(false);
  // Pending (in-flight) guesses live here, keyed by scribble id. They get
  // rendered alongside active.guesses; on resolution we drop them and update
  // the parent state with the real graded row.
  const [pendingByScribble, setPendingByScribble] = useState<Record<string, GuessHistoryItem[]>>({});
  // Tick to force timer re-render once a second. The actual remaining time
  // is computed from active.viewedAt + active.timerMs.
  const [, forceTick] = useState(0);

  useEffect(() => {
    setGuessInput("");
    setError("");
    setClueRevealed(false);
  }, [activeIndex]);

  // --- Start the timer when the user lands on a scribble for the first time.
  // POST /api/scribble/view is idempotent; if viewedAt is already set, the
  // server just echoes the existing value. We track per-id to avoid hammering.
  const viewedSentRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!active) return;
    if (active.finished) return;
    if (active.viewedAt != null) return;
    if (viewedSentRef.current.has(active.id)) return;
    viewedSentRef.current.add(active.id);
    const targetId = active.id;
    fetch("/api/scribble/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: targetId }),
    })
      .then((r) => (r.ok ? r.json() as Promise<{ viewedAt: number; remainingMs: number }> : null))
      .then((data) => {
        if (!data) return;
        onUpdate(targetId, { viewedAt: data.viewedAt, remainingMs: data.remainingMs });
      })
      .catch(() => {});
  }, [active, onUpdate]);

  // --- Tick the timer once per second while the game is live. ---------------
  useEffect(() => {
    if (!active) return;
    if (active.finished) return;
    if (active.viewedAt == null) return;
    const i = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(i);
  }, [active]);

  if (ordered.length === 0 || !active) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white">
        <div
          className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0"
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
        >
          <button onClick={onClose} className="text-white text-2xl leading-none opacity-60 hover:opacity-100">×</button>
          <p className="text-sm font-semibold">收件箱</p>
          <div className="w-8" />
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          还没有人画给你哦
        </div>
      </div>
    );
  }

  const isPrompt = active.kind === "prompt";
  // Effective "is the game over" — server-truthful, but we also flip locally
  // when the timer hits 0 so the UI doesn't lag a round trip behind.
  const remainingMs =
    active.viewedAt == null
      ? active.timerMs
      : Math.max(0, active.viewedAt + active.timerMs - Date.now());
  const timerExpired = active.viewedAt != null && remainingMs <= 0;
  const finished = active.finished || active.guessGrade !== null || timerExpired;
  const showClue = isPrompt && (finished || clueRevealed) && !!active.guesserClue;

  // History to render = server's guesses + locally pending ones for this id.
  const pending = pendingByScribble[active.id] ?? [];
  const history: GuessHistoryItem[] = [...active.guesses, ...pending];

  async function handleReveal() {
    if (!active) return;
    if (!confirm("看答案？这道题就不再算作未猜。")) return;
    setError("");
    try {
      const res = await fetch("/api/scribble/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: active.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to reveal");
        return;
      }
      const data = await res.json() as {
        finalGrade: Grade;
        word: string;
        drawerDescription: string;
        pinyin: string;
        explanation: string;
      };
      onUpdate(active.id, {
        finished: true,
        finalGrade: data.finalGrade,
        guessGrade: "revealed",
        word: data.word,
        drawerDescription: data.drawerDescription || active.drawerDescription,
        pinyin: data.pinyin || active.pinyin,
        explanation: data.explanation || active.explanation,
      });
    } catch {
      setError("Network error");
    }
  }

  async function handleSubmitGuess() {
    if (!active) return;
    if (finished) return;
    const trimmed = guessInput.trim();
    if (!trimmed) return;

    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const targetId = active.id;
    const elapsed = active.viewedAt != null ? Math.max(0, Date.now() - active.viewedAt) : 0;
    const optimistic: GuessHistoryItem = {
      id: tempId,
      text: trimmed,
      closeness: null,
      grade: null,
      timeUsedMs: elapsed,
      createdAt: Date.now(),
    };
    setPendingByScribble((m) => ({
      ...m,
      [targetId]: [...(m[targetId] ?? []), optimistic],
    }));
    setGuessInput("");
    setError("");

    try {
      const res = await fetch("/api/scribble/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetId, guess: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string; finalGrade?: Grade };
        // If the server says time's up, finalize locally so the input goes away.
        if (data.finalGrade) {
          onUpdate(targetId, { finished: true, finalGrade: data.finalGrade });
        }
        setError(data.error ?? "Failed to submit guess");
        // Drop the optimistic pending row — it never landed.
        setPendingByScribble((m) => ({
          ...m,
          [targetId]: (m[targetId] ?? []).filter((g) => g.id !== tempId),
        }));
        return;
      }
      const data = await res.json() as {
        guessId: string;
        guess: string;
        closeness: number;
        grade: Grade;
        timeUsedMs: number;
        finalGrade: Grade | null;
        word: string | null;
        drawerDescription: string;
        pinyin: string;
        explanation: string;
      };

      // Move the optimistic row out of pending; push the real graded one
      // into the parent state so it survives navigation.
      setPendingByScribble((m) => ({
        ...m,
        [targetId]: (m[targetId] ?? []).filter((g) => g.id !== tempId),
      }));

      const realGuess: GuessHistoryItem = {
        id: data.guessId,
        text: data.guess,
        closeness: data.closeness,
        grade: data.grade,
        timeUsedMs: data.timeUsedMs,
        createdAt: Date.now(),
      };
      // We need a current snapshot of guesses to append. We grab it from the
      // active object captured at submit time, but to avoid stale closures
      // we use a functional partial assembly here: parent merges via spread.
      onUpdate(targetId, {
        guesses: [...(active.guesses ?? []), realGuess],
        ...(data.finalGrade
          ? {
              finished: true,
              finalGrade: data.finalGrade,
              word: data.word,
              drawerDescription: data.drawerDescription || active.drawerDescription,
              pinyin: data.pinyin || active.pinyin,
              explanation: data.explanation || active.explanation,
            }
          : {}),
      });
    } catch {
      setError("Network error");
      setPendingByScribble((m) => ({
        ...m,
        [targetId]: (m[targetId] ?? []).filter((g) => g.id !== tempId),
      }));
    }
  }

  // --- Render --------------------------------------------------------------

  const seconds = Math.ceil(remainingMs / 1000);
  const timerRatio = Math.max(0, Math.min(1, remainingMs / active.timerMs));
  const timerTone =
    finished
      ? { ring: "ring-gray-700", text: "text-gray-500", bar: "bg-gray-600" }
      : seconds <= 10
      ? { ring: "ring-red-400",    text: "text-red-300",    bar: "bg-red-400" }
      : seconds <= 30
      ? { ring: "ring-yellow-400", text: "text-yellow-300", bar: "bg-yellow-400" }
      : { ring: "ring-gray-600",   text: "text-gray-100",   bar: "bg-emerald-400" };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0"
        style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
      >
        <button onClick={onClose} className="text-white text-2xl leading-none opacity-60 hover:opacity-100">×</button>
        <div className="text-center flex-1 mx-2 min-w-0">
          <p className="text-xs text-gray-400">
            from <span className="font-medium text-white">@{active.senderUsername}</span> · {timeAgo(active.createdAt)}
          </p>
          {isPrompt && active.category ? (
            <p className="mt-0.5">
              <span className="inline-block px-2.5 py-1 rounded-full bg-[#2B4B8C] text-xs font-semibold tracking-wider">
                {active.category}
              </span>
            </p>
          ) : (
            <p className="text-sm font-semibold mt-0.5">
              {finished ? "揭晓答案" : "猜成语 · what's the idiom?"}
            </p>
          )}
        </div>
        <div className="w-10 text-xs text-gray-400 text-right">
          {activeIndex + 1}/{ordered.length}
        </div>
      </div>

      {/* Timer bar (new flow only — legacy idiom rows had no guess timer) */}
      {isPrompt && (
        <div className="flex items-center gap-3 px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
          <div className={`tabular-nums text-xl font-bold w-12 text-center ${timerTone.text}`}>
            {seconds}
            <span className="text-[10px] font-normal text-gray-500 ml-0.5">s</span>
          </div>
          <div className={`flex-1 h-2 rounded-full bg-gray-800 ring-1 ${timerTone.ring} overflow-hidden`}>
            <div
              className={`h-full ${timerTone.bar} transition-[width] duration-200 linear`}
              style={{ width: `${timerRatio * 100}%` }}
            />
          </div>
          {finished && (
            <span className="text-xs font-semibold text-gray-400 shrink-0">已结束</span>
          )}
        </div>
      )}

      {/* Drawing — animated replay if a recording exists, static image otherwise. */}
      <ScribbleReplay
        recordingUrl={active.recordingUrl}
        fallbackImageUrl={active.imageUrl}
        resetKey={active.id}
        onProgress={(p) => {
          if (p >= CLUE_REVEAL_AT && !clueRevealed) setClueRevealed(true);
        }}
      />

      {/* Mid-replay clue banner */}
      {isPrompt && !finished && clueRevealed && active.guesserClue && (
        <div className="px-4 py-2 bg-amber-900/40 border-t border-amber-700/50 shrink-0">
          <p className="text-[10px] text-amber-300 uppercase tracking-wider">提示</p>
          <p className="text-sm text-amber-100">{active.guesserClue}</p>
        </div>
      )}

      {/* Guess history (newest at bottom near the input). For legacy rows,
          we skip this since they only ever had a single shot. */}
      {isPrompt && history.length > 0 && (
        <div className="px-4 py-2 bg-gray-850/50 border-t border-gray-800 shrink-0 max-h-32 overflow-y-auto">
          <ul className="space-y-1">
            {history.map((g) => {
              const isPending = g.grade === null;
              const tone = g.grade ? GRADE_DISPLAY[g.grade] : null;
              return (
                <li key={g.id} className="flex items-center gap-2 text-xs">
                  {isPending ? (
                    <span className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
                      <span className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
                    </span>
                  ) : (
                    <span
                      className={`w-6 h-6 rounded-full ring-2 ${tone!.ring} ${tone!.bg} flex items-center justify-center font-bold text-[11px] ${tone!.color} shrink-0`}
                    >
                      {g.grade}
                    </span>
                  )}
                  <span className="flex-1 text-gray-200 truncate">{g.text}</span>
                  {!isPending && (
                    <span className="text-[10px] text-gray-500 tabular-nums">
                      {Math.round((g.closeness ?? 0))}% · {(g.timeUsedMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Bottom: input (while live) or final-grade reveal (when finished) */}
      {!finished ? (
        <div className="px-4 py-3 bg-gray-800 border-t border-gray-700 shrink-0 space-y-2">
          <p className="text-xs text-gray-400">
            {isPrompt
              ? `猜一猜这是什么 (${active.category ?? "类别"})`
              : "输入你猜的成语 (中文或拼音都行)"}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmitGuess(); }}
              placeholder={isPrompt ? "再猜一个，或换个角度" : "例如：画蛇添足"}
              autoFocus
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#2B4B8C]"
            />
            <button
              onClick={() => void handleSubmitGuess()}
              disabled={guessInput.trim().length === 0}
              className="px-4 py-2 text-sm font-semibold bg-[#2B4B8C] text-white rounded-lg hover:bg-[#1e3a70] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              猜
            </button>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => void handleReveal()}
              className="text-[11px] text-gray-400 hover:text-gray-200 underline"
            >
              👀 看答案
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div key={active.id} className="px-4 py-4 bg-gray-800 border-t border-gray-700 shrink-0">
          {/* New scoring: show the big letter grade */}
          {active.finalGrade ? (
            <div className="text-center mb-3">
              <div
                className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${GRADE_DISPLAY[active.finalGrade].bg} ring-4 ${GRADE_DISPLAY[active.finalGrade].ring}`}
              >
                <span className={`text-4xl font-extrabold ${GRADE_DISPLAY[active.finalGrade].color}`}>
                  {active.finalGrade}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">{GRADE_DISPLAY[active.finalGrade].subtitle}</p>
            </div>
          ) : active.guessGrade ? (
            // Legacy 3-tier display for old idiom rows.
            <div className="text-center mb-3">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-900 ring-2 ${LEGACY_DISPLAY[active.guessGrade].ring}`}>
                <span className={`font-bold text-sm ${LEGACY_DISPLAY[active.guessGrade].color}`}>
                  {LEGACY_DISPLAY[active.guessGrade].title}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">{LEGACY_DISPLAY[active.guessGrade].subtitle}</p>
            </div>
          ) : null}

          <div className="space-y-1 text-center">
            <p className="text-xs text-gray-400 mt-2">正确答案</p>
            <p className="text-2xl font-bold tracking-wider">{active.word ?? ""}</p>
            {isPrompt && active.drawerDescription && (
              <p className="text-xs text-gray-400 line-clamp-3">{active.drawerDescription}</p>
            )}
            {showClue && active.guesserClue && (
              <p className="text-[11px] text-amber-200/80">提示: {active.guesserClue}</p>
            )}
            {active.pinyin && <p className="text-xs text-gray-300 mt-1">{active.pinyin}</p>}
            {active.explanation && <p className="text-xs text-gray-400 line-clamp-3">{active.explanation}</p>}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-t border-gray-800 shrink-0">
        <button
          onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          disabled={activeIndex === 0}
          className="px-3 py-1.5 text-xs text-gray-300 border border-gray-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-800"
        >
          ← Prev
        </button>
        <div className="flex-1 flex justify-center gap-1.5">
          {ordered.map((s, i) => {
            const dotColor =
              i === activeIndex
                ? "bg-white"
                : s.finalGrade === "S"
                ? "bg-yellow-300"
                : s.finalGrade === "A"
                ? "bg-emerald-300"
                : s.finalGrade === "B"
                ? "bg-blue-300"
                : s.finalGrade === "C"
                ? "bg-violet-300"
                : s.finalGrade === "D"
                ? "bg-orange-300"
                : s.finalGrade === "F"
                ? "bg-gray-500"
                : s.guessGrade === "exact"
                ? "bg-yellow-300"
                : s.guessGrade === "similar"
                ? "bg-green-400"
                : s.guessGrade === "wrong" || s.guessGrade === "revealed"
                ? "bg-gray-500"
                : "bg-pink-400";
            return (
              <button
                key={s.id}
                onClick={() => setActiveIndex(i)}
                className={`w-2 h-2 rounded-full transition-colors ${dotColor}`}
                aria-label={`Go to scribble ${i + 1}`}
              />
            );
          })}
        </div>
        <button
          onClick={() => setActiveIndex((i) => Math.min(ordered.length - 1, i + 1))}
          disabled={activeIndex === ordered.length - 1}
          className="px-3 py-1.5 text-xs text-gray-300 border border-gray-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-800"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
