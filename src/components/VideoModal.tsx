"use client";

import { useEffect, useRef, useState } from "react";

const PREFETCH_SECONDS = 8; // buffer this much head-start before offering play

export default function VideoModal({
  onClose,
  closeLabel,
  readyLabel,
  src = "/api/media/video.mp4",
  endText,
  endFadeSeconds = 5,
}: {
  onClose: () => void;
  closeLabel: string;
  readyLabel: string;
  src?: string;
  // When set, the final `endFadeSeconds` fade the picture to black while this
  // line rises in the centre — replacing whatever the video ends on (e.g. credits).
  endText?: string;
  endFadeSeconds?: number;
}) {
  const SRC = src;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [prefetching, setPrefetching] = useState(true); // initial buffering gate
  const [pct, setPct] = useState(0);
  const [ready, setReady] = useState(false); // buffered, waiting for the user to start
  const [stalled, setStalled] = useState(false); // re-buffering mid-play
  const [endP, setEndP] = useState(0); // 0→1 across the closing fade

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let done = false;

    const bufferedEnd = () => (v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0);
    const goal = () => {
      const d = isFinite(v.duration) && v.duration > 0 ? v.duration : PREFETCH_SECONDS;
      return Math.min(PREFETCH_SECONDS, d);
    };

    const finish = () => {
      if (done) return;
      done = true;
      setPrefetching(false);
      setReady(true); // don't auto-play — let the user start it
    };

    const tick = () => {
      const g = goal();
      const be = bufferedEnd();
      setPct(Math.min(100, g > 0 ? (be / g) * 100 : 0));
      if (be >= g && g > 0) finish();
    };

    // Mobile browsers (iOS Safari especially) refuse to buffer ahead while a
    // video is paused: they load a few seconds then stop, so the buffered goal
    // above can never be reached and `progress` events cease. Watch for that
    // stall — once buffering stops advancing and there's playable data, offer
    // play anyway rather than spinning forever. Real buffering resumes on play,
    // and the mid-play `stalled` indicator covers any re-buffering from there.
    let lastBe = -1;
    let flat = 0;
    const guard = window.setInterval(() => {
      if (done) return;
      const be = bufferedEnd();
      if (be <= lastBe + 0.05) flat += 1;
      else flat = 0;
      lastBe = be;
      // ~2.4s with no buffering progress, and enough to start (HAVE_FUTURE_DATA
      // or some buffered head-start) → stop waiting for a head-start we won't get.
      if (flat >= 3 && (v.readyState >= 3 || be > 0.5)) finish();
    }, 800);

    const onCanPlayThrough = () => finish();
    const onWaiting = () => done && setStalled(true);
    const onPlaying = () => setStalled(false);

    // Drive the closing fade off playback position, so seeking updates it too.
    const onTime = () => {
      if (!endText) return;
      const d = v.duration;
      if (!isFinite(d) || d <= 0) return;
      const remaining = d - v.currentTime;
      setEndP(Math.min(1, Math.max(0, (endFadeSeconds - remaining) / endFadeSeconds)));
    };

    v.addEventListener("progress", tick);
    v.addEventListener("loadedmetadata", tick);
    v.addEventListener("canplay", tick);
    v.addEventListener("canplaythrough", onCanPlayThrough);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("timeupdate", onTime);
    v.load();

    return () => {
      window.clearInterval(guard);
      v.removeEventListener("progress", tick);
      v.removeEventListener("loadedmetadata", tick);
      v.removeEventListener("canplay", tick);
      v.removeEventListener("canplaythrough", onCanPlayThrough);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("timeupdate", onTime);
      v.pause();
    };
  }, [endText, endFadeSeconds]);

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

      {/* Cinematic ending: fade the picture to black while the line rises. */}
      {endText && endP > 0 && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-black" style={{ opacity: endP, transition: "opacity 250ms linear" }} />
          <div className="absolute inset-0 flex items-center justify-center px-10">
            <p
              className="text-center font-light leading-relaxed tracking-wide text-white"
              style={{
                whiteSpace: "pre-line",
                opacity: Math.min(1, Math.max(0, (endP - 0.2) / 0.6)),
                transform: `scale(${0.92 + 0.08 * Math.min(1, Math.max(0, (endP - 0.2) / 0.6))})`,
                transition: "opacity 250ms linear, transform 250ms linear",
                fontSize: "clamp(1.1rem, 5.2vw, 1.9rem)",
                textShadow: "0 2px 24px rgba(0,0,0,0.7)",
              }}
            >
              {endText}
            </p>
          </div>
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
