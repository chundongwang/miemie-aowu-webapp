"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/context/LocaleContext";

const VideoModal = dynamic(() => import("./VideoModal"), { ssr: false });

const SRC = "/qingge.mp4";

const COPY = {
  en: { fabLabel: "Play the song", close: "Close", ready: "情歌 · 梁静茹" },
  zh: { fabLabel: "播放情歌", close: "关闭", ready: "情歌 · 梁静茹" },
} as const;

export default function SongFAB() {
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
        <span className="text-2xl">🎵</span>
      </button>

      {open && <VideoModal src={SRC} onClose={() => setOpen(false)} closeLabel={t.close} readyLabel={t.ready} />}
    </>
  );
}
