"use client";

import { useEffect, useState } from "react";
import ScribbleReplay from "./ScribbleReplay";

export type Grade = "exact" | "similar" | "wrong" | "revealed";

export type InboxScribble = {
  id: string;
  // "prompt" → LLM-generated category/word; "idiom" → legacy 成语 row.
  kind: "prompt" | "idiom";
  // Prompt-flow fields:
  category: string | null;   // visible up-front to the guesser
  guesserClue: string | null; // hidden until mid-replay (then revealed)
  // The answer; null until the user has guessed (or revealed).
  word: string | null;
  // Extra context for the drawer; shared with the guesser after they guess.
  drawerDescription: string | null;
  // Legacy idiom-flow fields (null for prompt-flow rows):
  pinyin: string | null;
  explanation: string | null;
  imageUrl: string;
  // Animated replay JSON URL; null for legacy scribbles or upload failures.
  // Receiver falls back to the static imageUrl when this is null.
  recordingUrl: string | null;
  createdAt: number;
  viewedAt: number | null;
  guess: string | null;
  guessGrade: Grade | null;
  guessedAt: number | null;
  senderName: string;
  senderUsername: string;
};

export type GuessResult = {
  grade: Grade;
  guess: string;
  word: string;
  drawerDescription: string;
  pinyin: string;
  explanation: string;
};

type Props = {
  scribbles: InboxScribble[];
  onClose: () => void;
  onGuessed: (id: string, result: GuessResult) => void;
};

// Reveal the guesser clue once playback has crossed this fraction of the
// recording duration. Picked to land roughly halfway through so the early
// strokes still drive the guessing, but the player isn't stuck staring at
// a near-blank canvas without any verbal hint.
const CLUE_REVEAL_AT = 0.5;

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

const GRADE_DISPLAY: Record<Grade, { emoji: string; title: string; subtitle: string; color: string; ring: string }> = {
  exact: {
    emoji: "🌟",
    title: "完美!",
    subtitle: "Rare and amazing — exact match!",
    color: "text-yellow-300",
    ring: "ring-yellow-300",
  },
  similar: {
    emoji: "✨",
    title: "意思接近!",
    subtitle: "Great guess — same idea!",
    color: "text-green-300",
    ring: "ring-green-300",
  },
  wrong: {
    emoji: "💀",
    title: "差远了…",
    subtitle: "Better luck next time",
    color: "text-gray-300",
    ring: "ring-gray-500",
  },
  revealed: {
    emoji: "👀",
    title: "看了答案",
    subtitle: "下次试着猜猜看",
    color: "text-gray-300",
    ring: "ring-gray-500",
  },
};

export default function ScribbleInboxModal({ scribbles, onClose, onGuessed }: Props) {
  // Stable order: newest first, regardless of guess state. We sort by id+createdAt
  // so guessing doesn't reshuffle the active item out from under the user.
  const ordered = [...scribbles].sort((a, b) => b.createdAt - a.createdAt);

  // Start on the first unguessed scribble so the user lands on the new one.
  const [activeIndex, setActiveIndex] = useState(() => {
    const sorted = [...scribbles].sort((a, b) => b.createdAt - a.createdAt);
    const i = sorted.findIndex((s) => s.guessGrade === null);
    return i === -1 ? 0 : i;
  });
  const active = ordered[activeIndex];

  const [guessInput, setGuessInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Whether the guesser clue is currently revealed (mid-replay or post-guess).
  // Reset to false when the user navigates to a different scribble.
  const [clueRevealed, setClueRevealed] = useState(false);

  useEffect(() => {
    setGuessInput("");
    setError("");
    setClueRevealed(false);
  }, [activeIndex]);

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

  const guessed = active.guessGrade !== null;
  const grade = active.guessGrade;
  const isPrompt = active.kind === "prompt";
  // After guessing, the clue is no longer a teaser — it's part of the closure.
  const showClue = isPrompt && (guessed || clueRevealed) && !!active.guesserClue;

  async function handleReveal() {
    if (!active) return;
    if (!confirm("看答案？这道题就不再算作未猜。")) return;
    setSubmitting(true);
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
        setSubmitting(false);
        return;
      }
      const data = await res.json() as {
        grade: Grade;
        word: string;
        drawerDescription: string;
        pinyin: string;
        explanation: string;
      };
      onGuessed(active.id, {
        grade: data.grade,
        guess: "",
        word: data.word,
        drawerDescription: data.drawerDescription,
        pinyin: data.pinyin,
        explanation: data.explanation,
      });
    } catch {
      setError("Network error");
    }
    setSubmitting(false);
  }

  async function handleSubmitGuess() {
    if (!active) return;
    const trimmed = guessInput.trim();
    if (!trimmed) { setError("Type your guess"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/scribble/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: active.id, guess: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to submit guess");
        setSubmitting(false);
        return;
      }
      const data = await res.json() as {
        grade: Grade;
        word: string;
        drawerDescription: string;
        pinyin: string;
        explanation: string;
      };
      onGuessed(active.id, {
        grade: data.grade,
        guess: trimmed,
        word: data.word,
        drawerDescription: data.drawerDescription,
        pinyin: data.pinyin,
        explanation: data.explanation,
      });
    } catch {
      setError("Network error");
    }
    setSubmitting(false);
  }

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
          {/* Category is the headline framing for prompt-flow scribbles. */}
          {isPrompt && active.category ? (
            <p className="mt-0.5">
              <span className="inline-block px-2.5 py-1 rounded-full bg-[#2B4B8C] text-xs font-semibold tracking-wider">
                {active.category}
              </span>
            </p>
          ) : (
            <p className="text-sm font-semibold mt-0.5">
              {guessed ? "揭晓答案" : "猜成语 · what's the idiom?"}
            </p>
          )}
        </div>
        <div className="w-10 text-xs text-gray-400 text-right">
          {activeIndex + 1}/{ordered.length}
        </div>
      </div>

      {/* Drawing — animated replay if a recording exists, static image otherwise.
          The progress callback drives the mid-replay clue reveal. */}
      <ScribbleReplay
        recordingUrl={active.recordingUrl}
        fallbackImageUrl={active.imageUrl}
        resetKey={active.id}
        onProgress={(p) => {
          if (p >= CLUE_REVEAL_AT && !clueRevealed) setClueRevealed(true);
        }}
      />

      {/* Mid-replay clue banner — only for prompt-flow, pre-guess, after the
          recording has crossed the reveal point. After guessing the clue
          moves down into the answer panel for closure. */}
      {isPrompt && !guessed && clueRevealed && active.guesserClue && (
        <div className="px-4 py-2 bg-amber-900/40 border-t border-amber-700/50 shrink-0">
          <p className="text-[10px] text-amber-300 uppercase tracking-wider">提示</p>
          <p className="text-sm text-amber-100">{active.guesserClue}</p>
        </div>
      )}

      {/* Bottom panel: guess input OR reveal */}
      {!guessed ? (
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
              placeholder={isPrompt ? "在这里写下你的答案" : "例如：画蛇添足"}
              autoFocus
              disabled={submitting}
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#2B4B8C] disabled:opacity-60"
            />
            <button
              onClick={() => void handleSubmitGuess()}
              disabled={submitting || guessInput.trim().length === 0}
              className="px-4 py-2 text-sm font-semibold bg-[#2B4B8C] text-white rounded-lg hover:bg-[#1e3a70] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "…" : "猜"}
            </button>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => void handleReveal()}
              disabled={submitting}
              className="text-[11px] text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed underline"
            >
              👀 看答案
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div
          key={active.id}
          className="px-4 py-4 bg-gray-800 border-t border-gray-700 shrink-0"
        >
          {grade && (
            <div className="text-center mb-3">
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-900 ring-2 ${GRADE_DISPLAY[grade].ring}`}
              >
                <span className="text-2xl">{GRADE_DISPLAY[grade].emoji}</span>
                <span className={`font-bold text-sm ${GRADE_DISPLAY[grade].color}`}>
                  {GRADE_DISPLAY[grade].title}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">{GRADE_DISPLAY[grade].subtitle}</p>
            </div>
          )}

          <div className="space-y-1 text-center">
            {grade !== "revealed" && active.guess && (
              <>
                <p className="text-xs text-gray-400">你猜的是</p>
                <p className="text-sm text-gray-200">「{active.guess}」</p>
              </>
            )}
            <p className="text-xs text-gray-400 mt-2">正确答案</p>
            <p className="text-2xl font-bold tracking-wider">{active.word ?? ""}</p>
            {/* Prompt-flow extras: drawer description + the post-game clue
                (now plainly visible since the game is over). */}
            {isPrompt && active.drawerDescription && (
              <p className="text-xs text-gray-400 line-clamp-3">{active.drawerDescription}</p>
            )}
            {showClue && active.guesserClue && (
              <p className="text-[11px] text-amber-200/80">提示: {active.guesserClue}</p>
            )}
            {/* Legacy idiom extras */}
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
          {ordered.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveIndex(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === activeIndex
                  ? "bg-white"
                  : s.guessGrade === null
                    ? "bg-pink-400"
                    : s.guessGrade === "exact"
                      ? "bg-yellow-300"
                      : s.guessGrade === "similar"
                        ? "bg-green-400"
                        : s.guessGrade === "revealed"
                          ? "bg-gray-500"
                          : "bg-gray-600"
              }`}
              aria-label={`Go to scribble ${i + 1}`}
            />
          ))}
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
