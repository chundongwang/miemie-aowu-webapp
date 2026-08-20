"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/context/LocaleContext";

const StoryModal = dynamic(() => import("./StoryModal"), { ssr: false });

const COPY = {
  en: { fabLabel: "Read the story" },
  zh: { fabLabel: "读一个故事" },
} as const;

export default function StoryFAB() {
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
        <span className="text-2xl">📖</span>
      </button>

      {open && <StoryModal onClose={() => setOpen(false)} />}
    </>
  );
}
