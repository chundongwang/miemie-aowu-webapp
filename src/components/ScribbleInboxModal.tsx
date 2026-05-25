"use client";

import { useEffect, useState } from "react";

export type InboxScribble = {
  id: string;
  word: string;
  sentenceEn: string;
  sentenceZh: string;
  imageUrl: string;
  createdAt: number;
  viewedAt: number | null;
  senderName: string;
  senderUsername: string;
};

type Props = {
  scribbles: InboxScribble[];
  onClose: () => void;
  onAllViewed: () => void;
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

export default function ScribbleInboxModal({ scribbles, onClose, onAllViewed }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = scribbles[activeIndex];

  // Mark every unread scribble as viewed when the modal opens.
  useEffect(() => {
    const hasUnread = scribbles.some((s) => s.viewedAt === null);
    if (!hasUnread) return;
    void fetch("/api/scribble/view", { method: "POST" })
      .then(() => onAllViewed())
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (scribbles.length === 0 || !active) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white">
        <div
          className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0"
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
        >
          <button
            onClick={onClose}
            className="text-white text-2xl leading-none opacity-60 hover:opacity-100"
          >
            ×
          </button>
          <p className="text-sm font-semibold">Scribble inbox</p>
          <div className="w-8" />
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          No scribbles yet
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0"
        style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
      >
        <button
          onClick={onClose}
          className="text-white text-2xl leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
        <div className="text-center flex-1 mx-2 min-w-0">
          <p className="text-xs text-gray-400">
            from <span className="font-medium text-white">@{active.senderUsername}</span> · {timeAgo(active.createdAt)}
          </p>
          <p className="text-lg font-bold">{active.word}</p>
          {active.sentenceEn && (
            <p className="text-xs text-gray-300 mt-0.5 line-clamp-2">{active.sentenceEn}</p>
          )}
          {active.sentenceZh && (
            <p className="text-xs text-gray-400 line-clamp-2">{active.sentenceZh}</p>
          )}
        </div>
        <div className="w-8 text-xs text-gray-400 text-right">
          {activeIndex + 1}/{scribbles.length}
        </div>
      </div>

      {/* Drawing */}
      <div className="flex-1 flex items-center justify-center bg-gray-950 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.imageUrl}
          alt={`Scribble of ${active.word} by @${active.senderUsername}`}
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border-t border-gray-700 shrink-0">
        <button
          onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          disabled={activeIndex === 0}
          className="px-4 py-2 text-sm text-gray-300 border border-gray-600 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700"
        >
          ← Prev
        </button>
        <div className="flex-1 flex justify-center gap-1">
          {scribbles.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveIndex(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === activeIndex
                  ? "bg-white"
                  : s.viewedAt === null
                    ? "bg-blue-400"
                    : "bg-gray-600"
              }`}
              aria-label={`Go to scribble ${i + 1}`}
            />
          ))}
        </div>
        <button
          onClick={() => setActiveIndex((i) => Math.min(scribbles.length - 1, i + 1))}
          disabled={activeIndex === scribbles.length - 1}
          className="px-4 py-2 text-sm text-gray-300 border border-gray-600 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
