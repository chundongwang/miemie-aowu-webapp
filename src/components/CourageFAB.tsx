"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/context/LocaleContext";

const VideoModal = dynamic(() => import("./VideoModal"), { ssr: false });

const SRC = "/api/media/yongqi.mp4"; // Range-aware route so mobile can seek
// The last 5s fade to black while these lines rise in the centre — the ending
// for（比我）勇敢的狼先生, in place of a credit roll. Blank lines = stanza breaks.
const END_TEXT = `我记得你说过
你不喜欢无意义的安慰

可有时候
就算知道没什么用
还是很想跑到你身边

这样的超能力
大概只有梦里才有`;

const COPY = {
  en: { fabLabel: "Play 勇气", close: "Close", ready: "勇气 · 梁静茹" },
  zh: { fabLabel: "播放勇气", close: "关闭", ready: "勇气 · 梁静茹" },
} as const;

// Hidden until Beijing time Aug 31, 2026 17:00 (= 09:00 UTC — CST is UTC+8).
const REVEAL_MS = Date.UTC(2026, 7, 31, 9, 0, 0);

export default function CourageFAB() {
  const locale = useLocale();
  const t = COPY[locale] ?? COPY.en;
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Client-only gate: decide after mount so SSR always renders nothing
    // (avoids a server/client clock mismatch around the reveal moment).
    // `?courage=1` force-shows the FAB for previewing before the reveal time.
    const override = new URLSearchParams(window.location.search).has("courage");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealed(override || Date.now() >= REVEAL_MS);
  }, []);

  if (!revealed) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t.fabLabel}
        className="w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center bg-[#a83246] hover:bg-[#8a2839]"
      >
        <span className="text-2xl">🦸</span>
      </button>

      {open && (
        <VideoModal
          src={SRC}
          endText={END_TEXT}
          onClose={() => setOpen(false)}
          closeLabel={t.close}
          readyLabel={t.ready}
        />
      )}
    </>
  );
}
