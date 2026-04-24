import { useEffect, useRef, useState, useCallback } from "react";

const THRESHOLD = 80;    // raw finger travel (px) to trigger refresh
const RESISTANCE = 0.4;  // visual dampening factor
const MAX_VISUAL = 56;   // max indicator height (px)

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const indicatorRef = useRef<HTMLDivElement>(null);

  // Keep onRefresh stable without stale closures
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  const startYRef   = useRef(0);
  const rawDeltaRef = useRef(0);
  const activeRef   = useRef(false);
  const refreshingRef = useRef(false);

  const setIndicatorHeight = (px: number) => {
    const el = indicatorRef.current;
    if (!el) return;
    el.style.height = `${px}px`;
    el.dataset.ready = rawDeltaRef.current >= THRESHOLD ? "1" : "0";
  };

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (refreshingRef.current) return;
    if (window.scrollY > 0) return;
    startYRef.current = e.touches[0].clientY;
    rawDeltaRef.current = 0;
    activeRef.current = true;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!activeRef.current || refreshingRef.current) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta <= 0) {
      activeRef.current = false;
      setIndicatorHeight(0);
      return;
    }
    // Prevent native overscroll bounce while we handle it
    if (window.scrollY === 0) e.preventDefault();
    rawDeltaRef.current = delta;
    setIndicatorHeight(Math.min(delta * RESISTANCE, MAX_VISUAL));
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (!activeRef.current) return;
    activeRef.current = false;

    if (rawDeltaRef.current >= THRESHOLD) {
      refreshingRef.current = true;
      setIsRefreshing(true);
      // snap indicator to spinner height
      if (indicatorRef.current) {
        indicatorRef.current.style.transition = "height 0.15s ease";
        indicatorRef.current.style.height = "48px";
        indicatorRef.current.dataset.ready = "0";
        // remove transition after snap so pull-down is instant
        setTimeout(() => {
          if (indicatorRef.current) indicatorRef.current.style.transition = "";
        }, 150);
      }
      await onRefreshRef.current();
      refreshingRef.current = false;
      setIsRefreshing(false);
      if (indicatorRef.current) {
        indicatorRef.current.style.transition = "height 0.2s ease";
        indicatorRef.current.style.height = "0px";
        setTimeout(() => {
          if (indicatorRef.current) indicatorRef.current.style.transition = "";
        }, 200);
      }
    } else {
      // snap back
      if (indicatorRef.current) {
        indicatorRef.current.style.transition = "height 0.2s ease";
        indicatorRef.current.style.height = "0px";
        setTimeout(() => {
          if (indicatorRef.current) indicatorRef.current.style.transition = "";
        }, 200);
      }
    }
    rawDeltaRef.current = 0;
  }, []);

  useEffect(() => {
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  return { indicatorRef, isRefreshing };
}
