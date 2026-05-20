"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const EDGE_START    = 40;   // swipe must begin within 40px of the left edge
const MIN_DISTANCE  = 72;   // must travel at least 72px rightward to trigger
const MAX_VERTICAL  = 60;   // cancel if vertical drift exceeds this

/**
 * Swipe right from the left edge to navigate back.
 * Returns a 0–1 progress value usable for a visual indicator.
 */
export function useSwipeBack(to: string, enabled = true): number {
  const router   = useRouter();
  const startX   = useRef<number | null>(null);
  const startY   = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled) { setProgress(0); return; }

    function onStart(e: TouchEvent) {
      const t = e.touches[0];
      if (t.clientX > EDGE_START) { startX.current = null; return; }
      startX.current = t.clientX;
      startY.current = t.clientY;
    }

    function onMove(e: TouchEvent) {
      if (startX.current === null) return;
      const t  = e.touches[0];
      const dx = t.clientX - startX.current;
      const dy = Math.abs(t.clientY - (startY.current ?? 0));
      if (dy > MAX_VERTICAL || dx < 0) { startX.current = null; setProgress(0); return; }
      setProgress(Math.min(dx / MIN_DISTANCE, 1));
    }

    function onEnd(e: TouchEvent) {
      if (startX.current === null) return;
      const t  = e.changedTouches[0];
      const dx = t.clientX - startX.current;
      const dy = Math.abs(t.clientY - (startY.current ?? 0));
      startX.current = null;
      setProgress(0);
      if (dx >= MIN_DISTANCE && dy <= MAX_VERTICAL) {
        router.push(to);
      }
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove",  onMove,  { passive: true });
    document.addEventListener("touchend",   onEnd,   { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove",  onMove);
      document.removeEventListener("touchend",   onEnd);
    };
  }, [enabled, to, router]);

  return progress;
}
