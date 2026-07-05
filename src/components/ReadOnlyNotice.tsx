"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/context/LocaleContext";

// Bump the suffix if you ever want the notice to auto-appear for everyone again.
const DISMISS_KEY = "readOnlyNoticeDismissed_20260719";

const COPY = {
  en: {
    badge: "A letter of thanks 🙏",
    title: "Going read-only on July 19, 2026",
    body: [
      "Every story has its ending.",
      "Right now, the pain is real.\nThe happiness we once had is real too.",
      "Thank you, Miss Sheep, for keeping Mr. Wolf company this past year.\nThank you for making me believe I truly can bring happiness to someone.",
      "The story ends here.\nBut the light of this year will stay, always.",
      "Until we meet again.",
      "Starting July 19, 2026, 咩咩~嗷呜 will enter read-only mode. You'll still be able to look back on everything, but new changes will be paused.",
    ],
    button: "Thank you 🙏",
    fabLabel: "A letter of thanks",
  },
  zh: {
    badge: "一封小小的感谢信 🙏",
    title: "2026 年 7 月 19 日起进入只读模式",
    body: [
      "每个故事都有结局。",
      "此刻，痛苦是真实的。\n曾经拥有的快乐，也是真实的。",
      "谢谢羊小姐陪伴狼先生这一年。\n谢谢你让我相信，我真的可以带给一个人幸福。",
      "故事在这里结束。\n但这一年的光，会一直留着。",
      "后会有期。",
      "从 2026 年 7 月 19 日起，咩咩~嗷呜 将进入只读模式。过往的一切仍可回看，但将暂停新的改动。",
    ],
    button: "谢谢你 🙏",
    fabLabel: "一封小小的感谢信",
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
      {/* Top of the right-side FAB stack — reopens the notice any time. */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t.fabLabel}
        className="fixed bottom-[24rem] right-6 sm:right-[calc(50%-208px)] z-20 w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center bg-[#2B4B8C] hover:bg-[#1e3a70]"
      >
        <span className="text-2xl">✉️</span>
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
              <div className="text-5xl mb-3">🐺🙏🐑</div>
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
                    className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-line"
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
