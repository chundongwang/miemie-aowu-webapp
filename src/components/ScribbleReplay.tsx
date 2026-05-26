"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number; t: number };
type Stroke = {
  color: string;
  size: number;
  points: Point[];
  isEraser?: boolean;
};
type Recording = {
  v: 1;
  width: number;
  height: number;
  bgColor: string;
  durationMs: number;
  strokes: Stroke[];
};

type Props = {
  recordingUrl: string | null;
  // Static fallback shown when recording is missing, fails to load, or while
  // it's being fetched (avoids a blank flash on slow connections).
  fallbackImageUrl: string;
  // Resets and replays from t=0 when this changes (e.g. user navigates to a
  // different scribble in the inbox carousel).
  resetKey: string;
  // Fires with 0..1 progress through the recording. Parent uses this to time
  // the mid-replay clue reveal. Only called while a recording is loaded.
  onProgress?: (progress: number) => void;
};

const PLAYBACK_TAIL_MS = 600; // hold the final frame briefly before stopping

export default function ScribbleReplay({ recordingUrl, fallbackImageUrl, resetKey, onProgress }: Props) {
  // Keep the latest onProgress in a ref so the playback loop doesn't have to
  // be re-created when the parent passes a fresh function each render.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const playAnchorRef = useRef<number>(0); // wall-clock ms when current play started
  const playTimeRef = useRef<number>(0); // current replay position in ms
  const recordingRef = useRef<Recording | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  // 0..1 progress, driven from playTimeRef by the rAF loop via setState only
  // when the user is paused; while playing we update the bar via DOM ref to
  // avoid 60 React re-renders per second.
  const [progress, setProgress] = useState(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // --- Fetch recording -----------------------------------------------------

  useEffect(() => {
    // New recording / new scribble → reset progress and notify parent so any
    // mid-replay reveal state (e.g. the guesser clue) is hidden again.
    setProgress(0);
    onProgressRef.current?.(0);
    if (!recordingUrl) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    fetch(recordingUrl)
      .then((r) => (r.ok ? r.json() as Promise<Recording> : Promise.reject(new Error("fetch failed"))))
      .then((data) => {
        if (cancelled) return;
        recordingRef.current = data;
        setDuration(data.durationMs);
        setLoading(false);
        // Auto-play when ready.
        playTimeRef.current = 0;
        startPlayback();
      })
      .catch(() => {
        if (cancelled) return;
        setLoadFailed(true);
        setLoading(false);
      });
    return () => { cancelled = true; };
    // recordingUrl + resetKey both retrigger a fresh load/replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingUrl, resetKey]);

  // --- Rendering -----------------------------------------------------------

  const renderFrame = useCallback((t: number) => {
    const canvas = canvasRef.current;
    const recording = recordingRef.current;
    if (!canvas || !recording) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fit the recording into the canvas preserving aspect ratio (object-contain).
    const recW = recording.width || rect.width;
    const recH = recording.height || rect.height;
    const scale = Math.min(rect.width / recW, rect.height / recH);
    const drawW = recW * scale;
    const drawH = recH * scale;
    const offX = (rect.width - drawW) / 2;
    const offY = (rect.height - drawH) / 2;

    // Background fills the whole canvas — the strokes' "eraser" mode paints
    // bgColor, so letterbox bars must match the strokes' background too.
    ctx.fillStyle = recording.bgColor;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of recording.strokes) {
      const pts = stroke.points;
      if (pts.length < 1) continue;
      // Find the index of the last point whose t <= current playback time.
      // Strokes are time-ordered so a linear scan is fine here; small enough
      // to not bother with binary search.
      let lastIdx = -1;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].t <= t) lastIdx = i;
        else break;
      }
      if (lastIdx < 0) continue;

      ctx.beginPath();
      ctx.strokeStyle = stroke.isEraser ? recording.bgColor : stroke.color;
      ctx.lineWidth = Math.max(0.5, stroke.size * scale);
      const p0 = pts[0];
      ctx.moveTo(offX + p0.x * scale, offY + p0.y * scale);
      for (let i = 1; i <= lastIdx; i++) {
        const p = pts[i];
        ctx.lineTo(offX + p.x * scale, offY + p.y * scale);
      }
      // If the next point is partway through being "drawn", interpolate so the
      // tip of the stroke moves smoothly rather than snapping point-to-point.
      if (lastIdx < pts.length - 1) {
        const a = pts[lastIdx];
        const b = pts[lastIdx + 1];
        const span = Math.max(1, b.t - a.t);
        const frac = Math.max(0, Math.min(1, (t - a.t) / span));
        const ix = a.x + (b.x - a.x) * frac;
        const iy = a.y + (b.y - a.y) * frac;
        ctx.lineTo(offX + ix * scale, offY + iy * scale);
      }
      ctx.stroke();
    }
  }, []);

  // --- Playback loop -------------------------------------------------------

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const loop = useCallback(() => {
    rafRef.current = null;
    const recording = recordingRef.current;
    if (!recording) return;
    const now = performance.now();
    const t = now - playAnchorRef.current;
    playTimeRef.current = t;
    const pct = recording.durationMs > 0 ? Math.min(1, t / recording.durationMs) : 1;
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${pct * 100}%`;
    }
    onProgressRef.current?.(pct);
    if (t >= recording.durationMs + PLAYBACK_TAIL_MS) {
      // Hold the final frame.
      renderFrame(recording.durationMs);
      setProgress(1);
      onProgressRef.current?.(1);
      setPlaying(false);
      return;
    }
    renderFrame(Math.min(t, recording.durationMs));
    rafRef.current = requestAnimationFrame(loop);
  }, [renderFrame]);

  const startPlayback = useCallback(() => {
    const recording = recordingRef.current;
    if (!recording) return;
    stopLoop();
    // Resume from current position unless we've finished, in which case loop
    // from the start. (Same button is "restart" in that state.)
    const startAt =
      playTimeRef.current >= recording.durationMs ? 0 : playTimeRef.current;
    playTimeRef.current = startAt;
    playAnchorRef.current = performance.now() - startAt;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop, stopLoop]);

  const pausePlayback = useCallback(() => {
    stopLoop();
    setPlaying(false);
    setProgress(
      recordingRef.current && recordingRef.current.durationMs > 0
        ? Math.min(1, playTimeRef.current / recordingRef.current.durationMs)
        : 0
    );
  }, [stopLoop]);

  const restartPlayback = useCallback(() => {
    playTimeRef.current = 0;
    setProgress(0);
    startPlayback();
  }, [startPlayback]);

  // Stop on unmount.
  useEffect(() => stopLoop, [stopLoop]);

  // Redraw on resize so the canvas stays crisp + correctly scaled.
  useEffect(() => {
    function onResize() {
      renderFrame(playTimeRef.current);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderFrame]);

  // --- Render --------------------------------------------------------------

  // No recording → just show the static image (legacy behavior).
  if (!recordingUrl || loadFailed) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-gray-950 overflow-hidden relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fallbackImageUrl}
          alt="Scribble drawing"
          className="max-w-full max-h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col bg-gray-950 overflow-hidden relative">
      <div className="flex-1 relative flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
        />
        {loading && (
          <p className="relative text-xs text-gray-500 animate-pulse">Loading replay…</p>
        )}
      </div>

      {/* Controls */}
      {!loading && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-900/80 backdrop-blur-sm border-t border-gray-800 shrink-0">
          <button
            onClick={() => (playing ? pausePlayback() : startPlayback())}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white shrink-0"
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            onClick={() => restartPlayback()}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white text-sm shrink-0"
            aria-label="Restart"
            title="Restart"
          >
            ↻
          </button>
          <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              ref={progressBarRef}
              className="h-full bg-white"
              style={{ width: playing ? undefined : `${progress * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 tabular-nums w-10 text-right">
            {(duration / 1000).toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  );
}
