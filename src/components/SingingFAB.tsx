"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const SingingPanel = dynamic(() => import("@/features/singing/SingingPanel"), { ssr: false });

export default function SingingFAB() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)} aria-label="打开练唱空间" title="练唱空间"
      className="w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center bg-[#607b66] hover:bg-[#48614e]">
      <span className="text-2xl" aria-hidden="true">🎤</span>
    </button>
    {open && <SingingPanel onClose={() => setOpen(false)} />}
  </>;
}
