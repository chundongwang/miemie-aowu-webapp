"use client";

import { useState, useEffect } from "react";

const FEELING_EMOJIS = ["😊", "🥰", "🤩", "😎", "😌", "🥳", "😴", "🤔", "😤", "😭", "🥹", "🫥"];

type CheckInEntry = {
  id: string;
  dateStr: string;
  emoji: string | null;
  createdAt: number;
};

type Props = {
  totalDays: number;
  todayCheckedIn: boolean;
  todayEmoji: string | null;
  onClose: () => void;
  onCheckIn: (newTotal: number, emoji: string) => void;
};

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function CheckInModal({
  totalDays,
  todayCheckedIn,
  todayEmoji,
  onClose,
  onCheckIn,
}: Props) {
  const [selected, setSelected]   = useState<string>(todayEmoji ?? "🫥");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]            = useState(todayCheckedIn);
  const [confirmedEmoji, setConfirmedEmoji] = useState<string | null>(todayEmoji);
  const [currentTotal, setCurrentTotal]     = useState(totalDays);
  const [history, setHistory]  = useState<CheckInEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    fetch("/api/checkins")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const d = data as { checkIns: CheckInEntry[]; totalDays: number } | null;
        if (d) {
          setHistory(d.checkIns);
          setCurrentTotal(d.totalDays);
        }
        setLoadingHistory(false);
      });
  }, []);

  const today = new Date().toLocaleDateString("sv"); // YYYY-MM-DD in local time

  async function handleCheckIn() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateStr: today, emoji: selected }),
      });
      if (res.ok) {
        const data = await res.json() as { totalDays: number; emoji: string };
        setCurrentTotal(data.totalDays);
        setConfirmedEmoji(data.emoji);
        setDone(true);
        onCheckIn(data.totalDays, data.emoji);
        // Refresh history
        const freshEntry: CheckInEntry = {
          id: "today",
          dateStr: today,
          emoji: data.emoji,
          createdAt: Date.now(),
        };
        setHistory((prev) => {
          const filtered = prev.filter((c) => c.dateStr !== today);
          return [freshEntry, ...filtered].slice(0, 10);
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">打卡 Check In</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">
              💰 {currentTotal}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none self-start"
          >
            ×
          </button>
        </div>

        {/* Today section */}
        <div className="px-5 pb-4">
          {done ? (
            <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 rounded-xl px-4 py-3">
              <span className="text-3xl">{confirmedEmoji ?? "🫥"}</span>
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-400">今天已获得金币 💰 ✓</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{fmtDate(today)}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">今天感觉怎么样？</p>
              {/* Emoji picker */}
              <div className="grid grid-cols-6 gap-1.5 mb-3">
                {FEELING_EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setSelected(e)}
                    className={`text-2xl rounded-xl py-1.5 transition-colors ${
                      selected === e
                        ? "bg-[#2B4B8C]/15 ring-2 ring-[#2B4B8C]"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCheckIn}
                disabled={submitting}
                className="w-full bg-[#2B4B8C] text-white rounded-xl py-2.5 text-sm font-medium hover:bg-[#1e3a70] disabled:opacity-50 transition-colors"
              >
                {submitting ? "领取中…" : `${selected} 领取金币`}
              </button>
            </>
          )}
        </div>

        {/* History */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3 max-h-52 overflow-y-auto">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">最近金币</p>
          {loadingHistory ? (
            <p className="text-xs text-gray-300 dark:text-gray-600 py-2 text-center">…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">还没有金币，今天领取第一枚！</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((ci) => (
                <li key={ci.id} className="flex items-center gap-2">
                  <span className="text-lg w-7 text-center">{ci.emoji ?? "🫥"}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(ci.dateStr)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
