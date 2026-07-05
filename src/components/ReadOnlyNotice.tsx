"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/context/LocaleContext";

// Bump the suffix if you ever want the notice to auto-appear for everyone again.
const DISMISS_KEY = "readOnlyNoticeDismissed_20260719";

const COPY = {
  en: {
    badge: "A little note 💛",
    title: "Going read-only on July 19, 2026",
    body: [
      "Starting July 19, 2026, 咩咩~嗷呜 will enter read-only mode. You'll still be able to look back on everything, but new changes will be paused.",
      "Thank you, Miss Miemie, for keeping Mr. Aowu company this past year. Every bit of the happiness you brought is deeply appreciated. 🐑💛🐺",
    ],
    button: "Thank you 💛",
    fabLabel: "About read-only mode",
  },
  zh: {
    badge: "一封小小的告白 💛",
    title: "2026 年 7 月 19 日起进入只读模式",
    body: [
      "从 2026 年 7 月 19 日起，咩咩~嗷呜 将进入只读模式。过往的一切仍可回看，但将暂停新的改动。",
      "感谢咩咩小姐这一年来陪伴嗷呜先生。你带来的每一份快乐，都被深深珍藏。🐑💛🐺",
    ],
    button: "谢谢你 💛",
    fabLabel: "关于只读模式",
  },
} as const;

export default function ReadOnlyNotice() {
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  // Auto-open once per client, unless previously dismissed. Deferred out of the
  // effect body so server + first client render both stay closed (no hydration
  // mismatch) and it opens on the next frame.
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = !!localStorage.getItem(DISMISS_KEY);
    } catch {
      // localStorage unavailable (e.g. private mode) — show once for this load.
    }
    if (dismissed) return;
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function close() {
    // Remember dismissal so the auto-popup won't return; the FAB can still reopen it.
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore — nothing we can do if storage is blocked
    }
    setOpen(false);
  }

  const t = COPY[locale] ?? COPY.en;

  return (
    <>
      {/* Bottom-left FAB — reopens the notice any time (right side is used by other FABs). */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t.fabLabel}
        className="fixed bottom-6 left-6 sm:left-[calc(50%-208px)] z-20 w-14 h-14 rounded-full shadow-lg active:scale-95 transition-all flex items-center justify-center bg-white dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <span className="text-2xl">💌</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className="px-6 pt-6 pb-5 text-center">
              <div className="text-5xl mb-3">🐑💛🐺</div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#2B4B8C] dark:text-blue-300">
                {t.badge}
              </p>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                {t.title}
              </h2>
              <div className="mt-3 space-y-3 text-left">
                {t.body.map((para, i) => (
                  <p
                    key={i}
                    className="text-sm leading-relaxed text-gray-600 dark:text-gray-300"
                  >
                    {para}
                  </p>
                ))}
              </div>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={close}
                className="w-full bg-[#2B4B8C] text-white rounded-xl py-2.5 text-sm font-medium hover:bg-[#1e3a70] transition-colors"
              >
                {t.button}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
