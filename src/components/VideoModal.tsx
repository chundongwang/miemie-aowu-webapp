"use client";

import { useEffect, useRef, useState } from "react";

const SRC = "/video.mp4";
const PREFETCH_SECONDS = 8; // buffer this much head-start before offering play

export default function VideoModal({
  onClose,
  closeLabel,
  readyLabel,
}: {
  onClose: () => void;
  closeLabel: string;
  readyLabel: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [prefetching, setPrefetching] = useState(true); // initial buffering gate
  const [pct, setPct] = useState(0);
  const [ready, setReady] = useState(false); // buffered, waiting for the user to start
  const [stalled, setStalled] = useState(false); // re-buffering mid-play

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let done = false;

    const bufferedEnd = () => (v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0);
    const goal = () => {
      const d = isFinite(v.duration) && v.duration > 0 ? v.duration : PREFETCH_SECONDS;
      return Math.min(PREFETCH_SECONDS, d);
    };

    const tick = () => {
      const g = goal();
      const be = bufferedEnd();
      setPct(Math.min(100, g > 0 ? (be / g) * 100 : 0));
      if (!done && be >= g && g > 0) {
        done = true;
        setPrefetching(false);
        setReady(true); // don't auto-play — let the user start it
      }
    };

    const onWaiting = () => done && setStalled(true);
    const onPlaying = () => setStalled(false);

    v.addEventListener("progress", tick);
    v.addEventListener("loadedmetadata", tick);
    v.addEventListener("canplaythrough", tick);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.load();

    return () => {
      v.removeEventListener("progress", tick);
      v.removeEventListener("loadedmetadata", tick);
      v.removeEventListener("canplaythrough", tick);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.pause();
    };
  }, []);

  const start = () => {
    setReady(false);
    videoRef.current?.play().catch(() => {});
  };
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black" role="dialog" aria-modal="true">
      <video
        ref={videoRef}
        src={SRC}
        preload="auto"
        playsInline
        controls
        className="absolute inset-0 h-full w-full object-contain"
      />

      {/* Tap the video body to toggle play/pause during playback. Leaves the
          bottom strip free for the native controls (seek / volume / fullscreen). */}
      {!prefetching && !ready && (
        <div className="absolute inset-x-0 bottom-16 top-0" onClick={togglePlay} aria-hidden="true" />
      )}

      {/* Initial prefetch gate */}
      {prefetching && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/25 border-t-white/90" />
          <div className="text-sm text-white/70">Buffering… {Math.round(pct)}%</div>
        </div>
      )}

      {/* Ready → the user starts playback */}
      {ready && (
        <button
          onClick={start}
          className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/45"
          aria-label={readyLabel}
        >
          <span className="rounded-full bg-black/55 px-5 py-2 text-xl font-medium text-white backdrop-blur-sm">
            {readyLabel}
          </span>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 text-4xl text-white ring-1 ring-white/30 backdrop-blur-sm">
            ▶
          </span>
        </button>
      )}

      {/* Re-buffering indicator during playback */}
      {stalled && !prefetching && !ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white/90" />
        </div>
      )}

      <button
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white/90 backdrop-blur-sm transition-colors hover:bg-white/25"
        style={{ top: "calc(env(safe-area-inset-top) + 1.25rem)" }}
      >
        ✕
      </button>
    </div>
  );
}
