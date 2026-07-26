"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/context/LocaleContext";

// three.js + the FBX model load only once the FAB is tapped.
const NoodleHeartModal = dynamic(() => import("./NoodleHeartModal"), { ssr: false });

const COPY = {
  en: { fabLabel: "A heart of noodles", close: "Close", hint: "scroll or drag up to pull the noodle" },
  zh: { fabLabel: "面条爱心", close: "关闭", hint: "向上滑动，把面条拉出来" },
} as const;

// Hidden until Aug 1, 2026 (local time).
const REVEAL_MS = new Date(2026, 7, 1).getTime();

export default function NoodleHeartFAB() {
  const locale = useLocale();
  const t = COPY[locale] ?? COPY.en;
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Client-only gate: decide after mount so SSR always renders nothing
    // (avoids a server/client timezone mismatch around the reveal moment).
    // `?kitty=1` force-shows the FAB for previewing before the reveal date.
    const override = new URLSearchParams(window.location.search).has("kitty");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealed(override || Date.now() >= REVEAL_MS);
  }, []);

  if (!revealed) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t.fabLabel}
        className="w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center bg-[#2B4B8C] hover:bg-[#1e3a70]"
      >
        <span className="text-2xl">😻</span>
      </button>

      {open && <NoodleHeartModal onClose={() => setOpen(false)} closeLabel={t.close} hint={t.hint} />}
    </>
  );
}
