"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/context/LocaleContext";

// The canvas simulation only loads once the FAB is tapped.
const CursorMinionsModal = dynamic(() => import("./CursorMinionsModal"), { ssr: false });

const COPY = {
  en: {
    fabLabel: "Cursor minions",
    close: "Close",
    hint: "a crew of cursors is on the clock… tap to make them start over",
    doneHint: "shift's over, they went back to the cave. tap to call them out again",
  },
  zh: {
    fabLabel: "光标牛马",
    close: "关闭",
    hint: "一群光标牛马正在加班… 点一下让它们重来",
    doneHint: "下班了，都回洞里歇着了。点一下再把它们叫出来",
  },
} as const;

export default function CursorMinionsFAB() {
  const locale = useLocale();
  const t = COPY[locale] ?? COPY.en;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t.fabLabel}
        title={t.fabLabel}
        className="w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center bg-[#3a6ea5] hover:bg-[#2d5a8a]"
      >
        <span className="text-2xl" aria-hidden="true">❄️</span>
      </button>

      {open && (
        <CursorMinionsModal onClose={() => setOpen(false)} closeLabel={t.close} hint={t.hint} doneHint={t.doneHint} />
      )}
    </>
  );
}
