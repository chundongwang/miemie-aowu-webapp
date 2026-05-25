"use client";

import { useEffect, useState } from "react";

export type Grade = "exact" | "similar" | "wrong";

export type InboxScribble = {
  id: string;
  // word + sentences are null until the receiver has guessed
  word: string | null;
  sentenceEn: string | null;
  sentenceZh: string | null;
  imageUrl: string;
  createdAt: number;
  viewedAt: number | null;
  guess: string | null;
  guessGrade: Grade | null;
  guessedAt: number | null;
  senderName: string;
  senderUsername: string;
};

type Props = {
  scribbles: InboxScribble[];
  onClose: () => void;
  onGuessed: (id: string, result: { grade: Grade; word: string; sentenceEn: string; sentenceZh: string; guess: string }) => void;
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

const GRADE_DISPLAY: Record<Grade, { emoji: string; title: string; subtitle: string; color: string; ring: string }> = {
  exact: {
    emoji: "🌟",
    title: "PERFECT!",
    subtitle: "Rare and amazing — exact match!",
    color: "text-yellow-300",
    ring: "ring-yellow-300",
  },
  similar: {
    emoji: "✨",
    title: "Close enough!",
    subtitle: "Great guess — same idea!",
    color: "text-green-300",
    ring: "ring-green-300",
  },
  wrong: {
    emoji: "💀",
    title: "Not quite…",
    subtitle: "Better luck next time",
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

  useEffect(() => {
    setGuessInput("");
    setError("");
  }, [activeIndex]);

  if (ordered.length === 0 || !active) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white">
        <div
          className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0"
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
        >
          <button onClick={onClose} className="text-white text-2xl leading-none opacity-60 hover:opacity-100">×</button>
          <p className="text-sm font-semibold">Scribble inbox</p>
          <div className="w-8" />
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          No scribbles yet
        </div>
      </div>
    );
  }

  const guessed = active.guessGrade !== null;
  const grade = active.guessGrade;

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
        sentenceEn: string;
        sentenceZh: string;
      };
      onGuessed(active.id, {
        grade: data.grade,
        word: data.word,
        sentenceEn: data.sentenceEn,
        sentenceZh: data.sentenceZh,
        guess: trimmed,
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
          <p className="text-sm font-semibold mt-0.5">
            {guessed ? "Answer revealed" : "What did they draw?"}
          </p>
        </div>
        <div className="w-10 text-xs text-gray-400 text-right">
          {activeIndex + 1}/{ordered.length}
        </div>
      </div>

      {/* Drawing */}
      <div className="flex-1 flex items-center justify-center bg-gray-950 overflow-hidden relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.imageUrl}
          alt="Scribble drawing"
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {/* Bottom panel: guess input OR reveal */}
      {!guessed ? (
        <div className="px-4 py-3 bg-gray-800 border-t border-gray-700 shrink-0 space-y-2">
          <p className="text-xs text-gray-400">Type your guess in English</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmitGuess(); }}
              placeholder="e.g. mountain"
              autoFocus
              disabled={submitting}
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#2B4B8C] disabled:opacity-60"
            />
            <button
              onClick={() => void handleSubmitGuess()}
              disabled={submitting || guessInput.trim().length === 0}
              className="px-4 py-2 text-sm font-semibold bg-[#2B4B8C] text-white rounded-lg hover:bg-[#1e3a70] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "…" : "Guess"}
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
            <p className="text-xs text-gray-400">You guessed</p>
            <p className="text-sm text-gray-200">"{active.guess}"</p>
            <p className="text-xs text-gray-400 mt-2">Actual word</p>
            <p className="text-xl font-bold">{active.word}</p>
            {active.sentenceEn && <p className="text-xs text-gray-300 mt-1">{active.sentenceEn}</p>}
            {active.sentenceZh && <p className="text-xs text-gray-400">{active.sentenceZh}</p>}
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
