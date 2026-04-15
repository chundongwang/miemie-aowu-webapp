"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT, useLocale } from "@/context/LocaleContext";

type ChallengeState = "idle" | "loading" | "answering" | "evaluating" | "result";

export default function LoginPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();

  // ── Login form ──────────────────────────────────────────────────────────────
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function doLogin() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      let data: { error?: string } = {};
      try { data = await res.json() as { error?: string }; } catch { /* non-JSON */ }
      if (!res.ok) { setError(t("errorInvalidCredentials")); return; }
      if (data.error) { setError(t("errorLogin")); return; }
      router.push("/lists");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doLogin();
  }

  // ── Vocab challenge ─────────────────────────────────────────────────────────
  const [challengeState,  setChallengeState]  = useState<ChallengeState>("idle");
  const [word,            setWord]            = useState("");
  const [sharedUsername,  setSharedUsername]  = useState("");
  const [answer,          setAnswer]          = useState("");
  const [result,          setResult]          = useState<{ correct: boolean; comment: string } | null>(null);
  const [countdown,       setCountdown]       = useState(5);

  // Countdown effect — runs whenever countdown/state changes, always sees fresh username+password
  useEffect(() => {
    if (challengeState !== "result" || !result?.correct) return;
    if (countdown === 0) {
      setChallengeState("idle");
      router.push("/lists"); // cookie already set server-side
      return;
    }
    const timer = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }); // intentionally no deps array — always reads latest state

  async function startChallenge() {
    setError("");
    setChallengeState("loading");
    setAnswer("");
    setSharedUsername("");
    setResult(null);
    const res = await fetch("/api/vocab-challenge/word");
    const data = await res.json() as { word: string };
    setWord(data.word);
    setChallengeState("answering");
  }

  async function submitAnswer() {
    if (!answer.trim() || !sharedUsername.trim()) return;
    setChallengeState("evaluating");
    const res = await fetch("/api/auth/login-challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, sharedUsername, word, answer, locale }),
    });
    const data = await res.json() as { correct: boolean; comment: string };
    setResult(data);
    setCountdown(5);
    setChallengeState("result");
  }

  function retryChallenge() {
    setAnswer("");
    setResult(null);
    setChallengeState("answering");
  }

  async function newWord() {
    setChallengeState("loading");
    setAnswer("");
    setSharedUsername("");
    setResult(null);
    const res = await fetch("/api/vocab-challenge/word");
    const data = await res.json() as { word: string };
    setWord(data.word);
    setChallengeState("answering");
  }

  function closeChallenge() {
    setChallengeState("idle");
    setAnswer("");
    setResult(null);
  }

  const showOverlay = challengeState !== "idle";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-center mb-8">{t("signIn")}</h1>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("username")}</label>
            <input
              type="text" required autoFocus value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("password")}</label>
            <input
              type="password" required value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Two buttons: normal login + fun challenge */}
          <div className="flex gap-2">
            <button
              type="submit" disabled={loading}
              className="flex-1 bg-[#2B4B8C] text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? t("signingIn") : t("signIn")}
            </button>
            <button
              type="button"
              onClick={startChallenge}
              disabled={loading}
              className="shrink-0 border-2 border-[#2B4B8C] text-[#2B4B8C] rounded-lg px-3 py-2 text-sm font-medium hover:bg-blue-50 disabled:opacity-50"
              title={t("mieTitle")}
            >
              {t("mieButton")}
            </button>
          </div>
        </form>

        <p className="text-sm text-center text-gray-500 mt-6">
          {t("noAccount")}{" "}
          <Link href="/register" className="text-[#2B4B8C] font-medium underline">{t("register")}</Link>
        </p>
      </div>

      {/* ── Challenge overlay ─────────────────────────────────────────────── */}
      {showOverlay && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">

            {/* Loading word */}
            {challengeState === "loading" && (
              <p className="text-center text-gray-400 py-8">Getting word…</p>
            )}

            {/* Answering */}
            {(challengeState === "answering" || challengeState === "evaluating") && (
              <>
                <div className="mb-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">{t("mieTitle")}</p>
                  <p className="text-4xl font-bold text-[#2B4B8C] tracking-tight">{word}</p>
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("mieSharedUserLabel")}</label>
                  <input
                    value={sharedUsername}
                    onChange={(e) => setSharedUsername(e.target.value)}
                    placeholder={t("mieSharedUserPlaceholder")}
                    disabled={challengeState === "evaluating"}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C] disabled:opacity-50"
                  />
                </div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("mieInstructions")}</label>
                <textarea
                  autoFocus
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={3}
                  placeholder={t("mieAnswerPlaceholder")}
                  disabled={challengeState === "evaluating"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submitAnswer();
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C] resize-none disabled:opacity-50"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={closeChallenge}
                    className="text-xs text-gray-400 hover:text-gray-600 px-2"
                  >
                    ×
                  </button>
                  <button
                    onClick={newWord}
                    disabled={challengeState === "evaluating"}
                    className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
                  >
                    {t("mieNewWord")}
                  </button>
                  <button
                    onClick={submitAnswer}
                    disabled={challengeState === "evaluating" || !answer.trim() || !sharedUsername.trim()}
                    className="ml-auto bg-[#2B4B8C] text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
                  >
                    {challengeState === "evaluating" ? t("mieEvaluating") : t("mieSubmit")}
                  </button>
                </div>
              </>
            )}

            {/* Result */}
            {challengeState === "result" && result && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{result.correct ? "🎓" : "😤"}</span>
                  <div>
                    <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{
                      color: result.correct ? "#16a34a" : "#dc2626"
                    }}>
                      {result.correct ? "Acceptable." : "Incorrect."}
                    </p>
                    <p className="text-sm text-gray-700 leading-snug italic">
                      "{result.comment}"
                    </p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      — Prof. Higgins
                    </p>
                  </div>
                </div>

                {result.correct ? (
                  <div className="text-center">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                      <div
                        className="h-full bg-[#2B4B8C] rounded-full transition-all duration-1000"
                        style={{ width: `${((5 - countdown) / 5) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      {t("mieLoginCountdown", { n: String(countdown) })}
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={retryChallenge}
                      className="flex-1 border border-[#2B4B8C] text-[#2B4B8C] rounded-lg py-2 text-sm font-medium hover:bg-blue-50"
                    >
                      {t("mieWrongRetry")}
                    </button>
                    <button
                      onClick={newWord}
                      className="flex-1 bg-[#2B4B8C] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#1e3a70]"
                    >
                      {t("mieNewWord")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
