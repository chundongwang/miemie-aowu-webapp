"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  items: { photos: { url: string }[] }[];
  itemIndex: number;
  photoIndex: number;
  onClose: () => void;
};

export default function Lightbox({ items, itemIndex, photoIndex, onClose }: Props) {
  // Flatten all photos across items into one array
  const allUrls = useMemo(
    () => items.flatMap((item) => item.photos.map((p) => p.url)),
    [items],
  );

  // Per-item photo counts for dot grouping
  const photoCounts = useMemo(
    () => items.map((item) => item.photos.length),
    [items],
  );

  // Starting flat index
  const startIndex = useMemo(() => {
    let offset = 0;
    for (let i = 0; i < itemIndex; i++) offset += items[i].photos.length;
    return offset + photoIndex;
  }, [items, itemIndex, photoIndex]);

  const [idx, setIdx] = useState(startIndex);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min(allUrls.length - 1, i + 1));

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
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
    if (dy > 0) setDragY(dy);
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
      onClose();
    } else if (adx > 50 && adx > ady) {
      dx < 0 ? next() : prev();
    }
  }

  const dragOpacity = isDragging ? Math.max(0.2, 1 - dragY / 250) : 1;

  // Compute which item the current flat index belongs to
  let currentItemIndex = 0;
  let offset = 0;
  for (let i = 0; i < photoCounts.length; i++) {
    if (idx < offset + photoCounts[i]) {
      currentItemIndex = i;
      break;
    }
    offset += photoCounts[i];
  }
  const currentPhotoInItem = idx - offset;

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
      {idx < allUrls.length - 1 && (
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
        key={allUrls[idx]}
        src={allUrls[idx]}
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

      {/* Dot indicators — grouped by item */}
      {allUrls.length > 1 && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-3 pointer-events-none">
          {photoCounts.map((count, i) => (
            <div key={i} className="flex gap-1.5">
              {Array.from({ length: count }).map((_, j) => (
                <span
                  key={j}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === currentItemIndex && j === currentPhotoInItem
                      ? "bg-white"
                      : "bg-white/35"
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}