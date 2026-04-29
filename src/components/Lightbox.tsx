"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  urls: string[];
  index: number;
  onClose: () => void;
};

export default function Lightbox({ urls, index: initialIndex, onClose }: Props) {
  const [idx, setIdx]     = useState(initialIndex);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min(urls.length - 1, i + 1));

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape")      onClose();
      if (e.key === "ArrowLeft")   prev();
      if (e.key === "ArrowRight")  next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setIsDragging(true);
    setDragY(0);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const dy = e.touches[0].clientY - touchStart.current.y;
    if (dy > 0) setDragY(dy); // only follow downward drag
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    setIsDragging(false);
    setDragY(0);

    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (dy > 100 && ady > adx) {
      onClose();                          // swipe down → close
    } else if (adx > 50 && adx > ady) {
      dx < 0 ? next() : prev();          // swipe left/right → navigate
    }
  }

  const dragOpacity = isDragging ? Math.max(0.2, 1 - dragY / 250) : 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ backgroundColor: `rgba(0,0,0,${0.95 * dragOpacity})` }}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Close */}
      <button
        className="absolute top-4 right-4 text-white text-3xl leading-none opacity-60 hover:opacity-100 z-10"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>

      {/* Prev */}
      {idx > 0 && (
        <button
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white text-5xl leading-none opacity-60 hover:opacity-100 z-10 select-none"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          aria-label="Previous"
        >
          ‹
        </button>
      )}

      {/* Next */}
      {idx < urls.length - 1 && (
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white text-5xl leading-none opacity-60 hover:opacity-100 z-10 select-none"
          onClick={(e) => { e.stopPropagation(); next(); }}
          aria-label="Next"
        >
          ›
        </button>
      )}

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={urls[idx]}
        src={urls[idx]}
        alt=""
        className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg"
        style={{
          transform: `translateY(${dragY}px)`,
          opacity: dragOpacity,
          transition: isDragging ? "none" : "transform 0.15s ease, opacity 0.15s ease",
        }}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* Dot indicators */}
      {urls.length > 1 && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 pointer-events-none">
          {urls.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === idx ? "bg-white" : "bg-white/35"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
