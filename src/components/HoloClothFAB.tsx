"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/context/LocaleContext";

// three.js + the holo scene load only once the FAB is tapped.
const HoloClothModal = dynamic(() => import("./HoloClothModal"), { ssr: false });

const COPY = {
  en: { fabLabel: "Holographic cloth", close: "Close" },
  zh: { fabLabel: "全息布", close: "关闭" },
} as const;

export default function HoloClothFAB() {
  const locale = useLocale();
  const t = COPY[locale] ?? COPY.en;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t.fabLabel}
        className="w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center bg-[#2B4B8C] hover:bg-[#1e3a70]"
      >
        <span className="text-2xl">🪩</span>
      </button>

      {open && <HoloClothModal onClose={() => setOpen(false)} closeLabel={t.close} />}
    </>
  );
}
