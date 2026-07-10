"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/context/LocaleContext";

// The 3D viewer pulls in three.js + loaders — load it only when the FAB is
// tapped so it never weighs down the rest of the app.
const RoseModal = dynamic(() => import("./RoseModal"), { ssr: false });

const COPY = {
  en: { fabLabel: "A rose for you", close: "Close" },
  zh: { fabLabel: "送你一朵玫瑰", close: "关闭" },
} as const;

export default function RoseLetter() {
  const locale = useLocale();
  const t = COPY[locale] ?? COPY.en;
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mail FAB — a love letter (envelope with a red heart). Opens the rose. */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t.fabLabel}
        className="fixed bottom-[24rem] right-6 sm:right-[calc(50%-208px)] z-20 w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center bg-[#2B4B8C] hover:bg-[#1e3a70]"
      >
        <span className="text-2xl">💌</span>
      </button>

      {open && <RoseModal onClose={() => setOpen(false)} closeLabel={t.close} />}
    </>
  );
}
