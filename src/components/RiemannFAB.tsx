"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/context/LocaleContext";

// The reader is the self-contained static page at /public/riemann/index.html
// (MathJax vendored alongside it), shown full-screen in an iframe.
const PAGE_URL = "/riemann/index.html";

const COPY = {
  en: { fabLabel: "Riemann hypothesis reader", title: "Riemann Hypothesis · Proof Atlas", close: "Close" },
  zh: { fabLabel: "黎曼猜想导读", title: "黎曼猜想证明 · 中文导读", close: "关闭" },
} as const;

export default function RiemannFAB() {
  const locale = useLocale();
  const t = COPY[locale] ?? COPY.en;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t.fabLabel}
        title={t.fabLabel}
        className="w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center bg-[#142d4f] hover:bg-[#0f2340]"
      >
        <span className="text-2xl font-serif italic text-white leading-none" aria-hidden="true">ζ</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-[#f7f8fb]" role="dialog" aria-modal="true" aria-label={t.title}>
          <div
            className="flex items-center justify-between gap-3 px-4 bg-[#142d4f] text-white shrink-0"
            style={{ paddingTop: "env(safe-area-inset-top)", minHeight: "calc(2.75rem + env(safe-area-inset-top))" }}
          >
            <span className="text-sm font-semibold truncate">{t.title}</span>
            <button
              onClick={() => setOpen(false)}
              aria-label={t.close}
              className="text-xl leading-none px-2 py-1 -mr-2 text-white/80 hover:text-white"
            >
              ✕
            </button>
          </div>
          {/* The wrapper scrolls on iOS, where the iframe itself grows to its content height. */}
          <div className="flex-1 min-h-0 overflow-auto" style={{ WebkitOverflowScrolling: "touch" }}>
            <iframe src={PAGE_URL} title={t.title} className="block w-full h-full border-0" />
          </div>
        </div>
      )}
    </>
  );
}
