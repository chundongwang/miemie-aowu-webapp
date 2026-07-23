"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/context/LocaleContext";

// The firework canvas is only needed once the FAB is tapped.
const FireworkModal = dynamic(() => import("./FireworkModal"), { ssr: false });

const COPY = {
  en: { fabLabel: "A wish for you", close: "Close" },
  zh: { fabLabel: "送你一句悄悄话", close: "关闭" },
} as const;

export default function FireworkLetter() {
  const locale = useLocale();
  const t = COPY[locale] ?? COPY.en;
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* FAB — opens a firework show that spells out a little wish. */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t.fabLabel}
        className="w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center bg-[#2B4B8C] hover:bg-[#1e3a70]"
      >
        <span className="text-2xl">🎆</span>
      </button>

      {open && <FireworkModal onClose={() => setOpen(false)} closeLabel={t.close} />}
    </>
  );
}
