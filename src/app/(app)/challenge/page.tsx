"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/context/LocaleContext";

type Status = "loading" | "pending" | "answered" | "skipped";

interface TodayData {
  word: string;
  period: string;
  status: Status;
  correct?: boolean;
  comment?: string;
  streak: number;
  todayDoneCount: number;
}

function streakMsg(n: number): string {
  if (n <= 0) return "";
  if (n === 1) return "🌱 1-day streak — nice start!";
  if (n < 5)  return `🌱 ${n}-day streak — building momentum!`;
  if (n < 10) return `🔥 ${n}-day streak — keep it up!`;
  if (n < 30) return `🔥🔥 ${n}-day streak — impressive!`;
  return `🔥🔥🔥 ${n}-day streak — legendary!`;
}

/** Minutes until the top of the next UTC hour */
function minsUntilNextHour(): number {
  const now = new Date();
  return 60 - now.getUTCMinutes();
}

export default function ChallengePage() {
  const t = useT();
  const router = useRouter();

  const [data, setData]         = useState<TodayData | null>(null);
  const [answer, setAnswer]     = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");
  const [retrying, setRetrying] = useState(false);
  const [minsLeft, setMinsLeft] = useState(minsUntilNextHour());

  useEffect(() => {
    fetch("/api/challenge/today")
      .then((r) => r.json() as Promise<TodayData>)
      .then((d) => setData(d));
  }, []);

  // Countdown ticker — updates every minute
  useEffect(() => {
    const t = setInterval(() => setMinsLeft(minsUntilNextHour()), 60_000);
    return () => clearInterval(t);
  }, []);

  async function submit() {
    if (!answer.trim() || busy) return;
    setBusy(true);
    setError("");
    const locale = typeof navigator !== "undefined" && navigator.language.startsWith("zh") ? "zh" : "en";
    const res = await fetch("/api/challenge/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: answer.trim(), locale }),
    });
    const json = await res.json() as { correct: boolean; comment: string; streak: number; error?: string };
    setBusy(false);
    if (json.error) { setError(json.error); return; }
    setRetrying(false);
    setAnswer("");
    setData((prev) => prev ? { ...prev, status: "answered", correct: json.correct, comment: json.comment, streak: json.streak } : prev);
  }

  async function skip() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/challenge/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skip: true }),
    });
    const json = await res.json() as { skipped: boolean; streak: number };
    setBusy(false);
    setData((prev) => prev ? { ...prev, status: "skipped", streak: json.streak } : prev);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center gap-3 z-10">
        <button
          onClick={() => router.push("/lists")}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl pr-1"
        >
          ‹
        </button>
        <div className="flex-1">
          <h1 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">IELTS Daily Challenge</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">雅思每日挑战 · new word every hour</p>
        </div>
        {data && data.todayDoneCount > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">{data.todayDoneCount} today</span>
        )}
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">
        {!data ? (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500 text-sm">{t("loading")}</div>
        ) : (
          <>
            {/* Word card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow-sm">
              <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
                This Hour's Word · 本小时词汇
              </p>
              <p className="text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-wide">{data.word}</p>
            </div>

            {/* Pending: input form */}
            {(data.status === "pending" || retrying) && (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  Use it in a sentence, or give the Chinese translation.<br />
                  <span className="text-gray-400 dark:text-gray-500">用这个词造句，或翻译成中文。</span>
                </p>
                <textarea
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-3 text-base resize-none focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
                  rows={4}
                  placeholder="Type a sentence or Chinese translation…"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
                  disabled={busy}
                  autoFocus
                />
                {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={submit}
                    disabled={busy || !answer.trim()}
                    className="flex-1 bg-[#2B4B8C] text-white font-medium py-3 rounded-xl disabled:opacity-40"
                  >
                    {busy ? "Professor is reading… 📖" : "Submit"}
                  </button>
                  <button
                    onClick={skip}
                    disabled={busy}
                    className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl"
                  >
                    Skip
                  </button>
                </div>
              </>
            )}

            {/* Answered: show result */}
            {data.status === "answered" && !retrying && (
              <>
                <div className={`rounded-2xl p-5 ${data.correct ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"}`}>
                  <p className={`text-sm font-semibold mb-2 ${data.correct ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {data.correct ? "✓ Correct" : "✗ Incorrect"}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{data.comment}"</p>
                </div>
                {data.streak > 0 && (
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400">{streakMsg(data.streak)}</p>
                )}
                <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                  Next word in {minsLeft} min
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setRetrying(true); setAnswer(""); setError(""); }}
                    className="flex-1 py-3 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Try again
                  </button>
                  <button
                    onClick={() => router.push("/lists")}
                    className="flex-1 py-3 text-sm font-medium bg-[#2B4B8C] text-white rounded-xl hover:bg-[#1e3a70]"
                  >
                    Back to lists
                  </button>
                </div>
              </>
            )}

            {/* Skipped */}
            {data.status === "skipped" && !retrying && (
              <>
                <div className="rounded-2xl p-5 bg-gray-100 dark:bg-gray-800 text-center">
                  <p className="text-3xl mb-2">😴</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Skipped this hour.</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Next word in {minsLeft} min · 下一个词还有 {minsLeft} 分钟
                  </p>
                </div>
                {data.streak > 0 && (
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400">{streakMsg(data.streak)}</p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setRetrying(true); setAnswer(""); setError(""); }}
                    className="flex-1 py-3 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Try anyway
                  </button>
                  <button
                    onClick={() => router.push("/lists")}
                    className="flex-1 py-3 text-sm font-medium bg-[#2B4B8C] text-white rounded-xl hover:bg-[#1e3a70]"
                  >
                    Back to lists
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
