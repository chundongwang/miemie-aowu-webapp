"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Point = { x: number; y: number; t: number };

type Stroke = {
  color: string;
  size: number;
  points: Point[];
  isEraser?: boolean;
};

// Cap idle gap between successive points so a draft resumed hours later
// (or a long thinking pause) doesn't produce a replay with minutes of dead air.
const MAX_GAP_MS = 1500;

type Recording = {
  v: 1;
  width: number;
  height: number;
  bgColor: string;
  durationMs: number;
  strokes: Stroke[];
};

type Contact = { username: string; displayName: string };

const BG_COLORS = [
  "#FFFFFF", "#000000", "#EF4444", "#3B82F6", "#22C55E",
  "#EAB308", "#F97316", "#A855F7", "#EC4899", "#9CA3AF",
];
const BRUSH_COLORS = [
  "#000000", "#FFFFFF", "#EF4444", "#3B82F6", "#22C55E",
  "#EAB308", "#F97316", "#A855F7", "#EC4899", "#9CA3AF", "#8B4513",
];

type Step = "loading" | "drawing" | "sharing" | "done" | "error";

// Bumping the key from v1 → v2 invalidates the old idiom-based drafts in
// users' localStorage so they don't try to resume into a different schema.
const DRAFT_KEY = "scribble:draft:v2";

const TIMER_TOTAL_MS = 75_000;
type TimerState = "idle" | "running" | "paused" | "expired";

type Draft = {
  promptId: string;
  category: string;
  word: string;
  drawerDescription: string;
  strokes: Stroke[];
  bgColor: string;
  brushColor: string;
  brushSize: number;
  isErasing: boolean;
  rerollsLeft: number;
  timeLeftMs: number;
  savedAt: number;
};

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (!parsed || typeof parsed !== "object" || !parsed.word || !parsed.promptId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

export default function ScribbleModal({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const redrawRef = useRef<() => void>(() => {});
  // Holds the rendered PNG once the user leaves the drawing step. The canvas
  // is unmounted while step !== "drawing", so we must capture before transition.
  const drawingBlobRef = useRef<Blob | null>(null);
  // JSON recording (strokes + timing) captured at submit time.
  const recordingBlobRef = useRef<Blob | null>(null);
  // Anchors the relative `t` timeline. Null until the user's first point;
  // re-anchored on draft restore so the next point continues just after the
  // last saved point instead of resetting to t=0.
  const recordStartRef = useRef<number | null>(null);
  const lastTRef = useRef<number>(0);

  const [step, setStep] = useState<Step>("loading");
  const [promptId, setPromptId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [word, setWord] = useState("");
  const [drawerDescription, setDrawerDescription] = useState("");

  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(3);
  const [isErasing, setIsErasing] = useState(false);

  // Timer — counts down from 75s once the user starts drawing. Pause/resume
  // freezes the wall-clock; expiry locks the canvas but still allows submit.
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [timeLeftMs, setTimeLeftMs] = useState(TIMER_TOTAL_MS);
  // Mirror of timerState into a ref so synchronous draw handlers (touchmove,
  // mousemove) can short-circuit while paused/expired without waiting for a
  // React re-render.
  const timerStateRef = useRef<TimerState>("idle");
  const timerStartedAtRef = useRef<number>(0); // wall clock when this run started
  const timerRemainingAtStartRef = useRef<number>(TIMER_TOTAL_MS); // timeLeft when this run started

  const [submitting, setSubmitting] = useState(false);
  const [rerollsLeft, setRerollsLeft] = useState(3);
  const [rerolling, setRerolling] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedReceiver, setSelectedReceiver] = useState<Contact | null>(null);
  const [submitError, setSubmitError] = useState("");

  async function fetchAndUseNewPrompt() {
    const res = await fetch("/api/scribble/prompt", { method: "POST" });
    if (!res.ok) throw new Error("fetch failed");
    const data = (await res.json()) as {
      promptId: string;
      category: string;
      word: string;
      drawerDescription: string;
    };
    setPromptId(data.promptId);
    setCategory(data.category);
    setWord(data.word);
    setDrawerDescription(data.drawerDescription);
    return data;
  }

  // Restore draft if present, else fetch a fresh prompt. Guards against
  // React Strict Mode's double-invoke.
  const hasInitedRef = useRef(false);
  useEffect(() => {
    if (hasInitedRef.current) return;
    hasInitedRef.current = true;

    const draft = loadDraft();
    if (draft) {
      setPromptId(draft.promptId);
      setCategory(draft.category);
      setWord(draft.word);
      setDrawerDescription(draft.drawerDescription);
      strokesRef.current = draft.strokes ?? [];
      // Re-anchor the recording timeline so resumed strokes continue from where
      // we left off rather than restarting at t=0.
      let maxT = 0;
      for (const s of strokesRef.current) {
        for (const p of s.points) if (p.t > maxT) maxT = p.t;
      }
      lastTRef.current = maxT;
      recordStartRef.current = null;
      setBgColor(draft.bgColor);
      setBrushColor(draft.brushColor);
      setBrushSize(draft.brushSize);
      setIsErasing(draft.isErasing);
      setRerollsLeft(draft.rerollsLeft);
      // Restore timer paused at the remaining time. User can resume by
      // pressing the play button or by simply drawing (auto-resumes).
      const remaining = Math.max(0, Math.min(TIMER_TOTAL_MS, draft.timeLeftMs ?? TIMER_TOTAL_MS));
      setTimeLeftMs(remaining);
      timerRemainingAtStartRef.current = remaining;
      // If they'd already exhausted their time, surface that immediately.
      const restoredState: TimerState = remaining <= 0 ? "expired" : "paused";
      setTimerState(restoredState);
      timerStateRef.current = restoredState;
      setStep("drawing");
      return;
    }

    fetchAndUseNewPrompt()
      .then(() => setStep("drawing"))
      .catch(() => setStep("error"));
  }, []);

  // Auto-save the current draft. Pulled into a ref so handlers (which run
  // outside React's batched render) can call it with up-to-date values.
  const saveDraftRef = useRef<() => void>(() => {});
  saveDraftRef.current = () => {
    if (!promptId || !word) return;
    try {
      const draft: Draft = {
        promptId,
        category,
        word,
        drawerDescription,
        strokes: strokesRef.current,
        bgColor,
        brushColor,
        brushSize,
        isErasing,
        rerollsLeft,
        timeLeftMs: getRemainingTime(),
        savedAt: Date.now(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch { /* quota exceeded — ignore */ }
  };

  // Persist whenever any React-tracked piece of state changes.
  useEffect(() => {
    if (step !== "drawing") return;
    saveDraftRef.current();
  }, [step, promptId, bgColor, brushColor, brushSize, isErasing, rerollsLeft]);

  // --- Canvas drawing -----------------------------------------------------------

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, rect.width, rect.height);
    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.isEraser ? bgColor : stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, [bgColor]);

  redrawRef.current = redraw;

  // Initial canvas setup + resize handler. `step` is a dep so redraw fires
  // once the canvas actually mounts (it only renders when step === "drawing").
  useEffect(() => {
    redraw();
    function onResize() { redraw(); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [redraw, step]);

  // Redraw when bgColor changes (redraw already depends on bgColor via useCallback)
  useEffect(() => { redraw(); }, [bgColor, redraw]);

  function getCanvasPos(e: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Returns the next monotonically-increasing `t` for the recording timeline.
  // First call (or after draft restore) re-anchors the wall clock so the next
  // point lands just after `lastTRef.current`. Subsequent calls cap idle gaps
  // at MAX_GAP_MS so long pauses don't bloat the replay.
  function nextT(): number {
    const now = Date.now();
    if (recordStartRef.current == null) {
      recordStartRef.current = now - lastTRef.current;
    } else {
      const elapsed = now - recordStartRef.current;
      const gap = elapsed - lastTRef.current;
      if (gap > MAX_GAP_MS) recordStartRef.current += gap - MAX_GAP_MS;
    }
    const t = now - recordStartRef.current;
    lastTRef.current = t;
    return t;
  }

  // Returns ms left on the timer right now, accounting for the wall-clock
  // elapsed since the current "running" run started. While idle / paused /
  // expired this is just the stored remaining value.
  function getRemainingTime(): number {
    if (timerStateRef.current === "running") {
      const elapsed = Date.now() - timerStartedAtRef.current;
      return Math.max(0, timerRemainingAtStartRef.current - elapsed);
    }
    return Math.max(0, timeLeftMs);
  }

  function startTimer() {
    timerStartedAtRef.current = Date.now();
    // Use the latest known remaining time; on first ever start this is the
    // full TIMER_TOTAL_MS.
    timerRemainingAtStartRef.current = timeLeftMs;
    timerStateRef.current = "running";
    setTimerState("running");
  }

  function pauseTimer() {
    if (timerStateRef.current !== "running") return;
    const remaining = getRemainingTime();
    timerRemainingAtStartRef.current = remaining;
    setTimeLeftMs(remaining);
    timerStateRef.current = "paused";
    setTimerState("paused");
    saveDraftRef.current();
  }

  function resumeTimer() {
    if (timerStateRef.current !== "paused") return;
    startTimer();
  }

  // Tick loop while running. Uses setInterval (cheap) rather than rAF.
  useEffect(() => {
    if (timerState !== "running") return;
    const i = setInterval(() => {
      const remaining = getRemainingTime();
      setTimeLeftMs(remaining);
      if (remaining <= 0) {
        timerRemainingAtStartRef.current = 0;
        timerStateRef.current = "expired";
        setTimerState("expired");
        saveDraftRef.current();
        clearInterval(i);
      }
    }, 100);
    return () => clearInterval(i);
    // getRemainingTime / saveDraftRef are stable enough that we don't need
    // them in deps; the interval reads fresh values via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerState]);

  function startDraw(x: number, y: number) {
    // Don't accept new strokes when time's up.
    if (timerStateRef.current === "expired") return;
    // First-ever stroke kicks the timer off; auto-resume from paused so the
    // user doesn't have to hit play before drawing.
    if (timerStateRef.current === "idle") startTimer();
    else if (timerStateRef.current === "paused") resumeTimer();

    isDrawingRef.current = true;
    lastPosRef.current = { x, y };
    strokesRef.current.push({
      color: brushColor,
      size: brushSize,
      points: [{ x, y, t: nextT() }],
      isEraser: isErasing,
    });
  }

  function moveDraw(x: number, y: number) {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const last = lastPosRef.current;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = isErasing ? bgColor : brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPosRef.current = { x, y };
    const currentStroke = strokesRef.current[strokesRef.current.length - 1];
    currentStroke.points.push({ x, y, t: nextT() });
  }

  function endDraw() {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    // Stroke is now in strokesRef.current — persist drawing progress.
    saveDraftRef.current();
  }

  // Mouse
  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const pos = getCanvasPos(e);
    startDraw(pos.x, pos.y);
  }
  function onMouseMove(e: React.MouseEvent) {
    const pos = getCanvasPos(e);
    moveDraw(pos.x, pos.y);
  }
  function onMouseUp() { endDraw(); }
  function onMouseLeave() { endDraw(); }

  // Touch — must be native non-passive listeners; React's synthetic touchmove
  // is passive by default, which makes preventDefault() a no-op (and prints
  // a console warning). Attached via useEffect below.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (step !== "drawing" || !canvas) return;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const pos = getCanvasPos(e.touches[0]);
      startDraw(pos.x, pos.y);
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const pos = getCanvasPos(e.touches[0]);
      moveDraw(pos.x, pos.y);
    }
    function onTouchEnd() { endDraw(); }

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [step, brushColor, brushSize, isErasing, bgColor]);

  // --- Actions ------------------------------------------------------------------

  function resetRecording() {
    recordStartRef.current = null;
    lastTRef.current = 0;
  }

  // Fresh prompt → fresh canvas → fresh recording → fresh 75s. Bundled here
  // so the reroll and delete-draft handlers stay aligned.
  function resetTimer() {
    timerRemainingAtStartRef.current = TIMER_TOTAL_MS;
    setTimeLeftMs(TIMER_TOTAL_MS);
    timerStateRef.current = "idle";
    setTimerState("idle");
  }

  function handleClear() {
    strokesRef.current = [];
    resetRecording();
    redraw();
  }

  async function handleRerollPrompt() {
    if (rerollsLeft <= 0 || rerolling) return;
    setRerolling(true);
    // Pause the timer while we wait for the LLM so the seconds don't tick
    // away during a multi-second network round trip.
    const wasRunning = timerStateRef.current === "running";
    if (wasRunning) pauseTimer();
    try {
      await fetchAndUseNewPrompt();
      // Different word → wipe canvas so the drawing matches the new prompt.
      strokesRef.current = [];
      resetRecording();
      resetTimer();
      redraw();
      setRerollsLeft((n) => n - 1);
    } catch {
      // Keep the current prompt; resume the clock if we paused it.
      if (wasRunning) resumeTimer();
    }
    setRerolling(false);
  }

  async function handleDeleteDraft() {
    if (!confirm("删除草稿并换一道新题？")) return;
    clearDraft();
    strokesRef.current = [];
    resetRecording();
    resetTimer();
    setRerollsLeft(3);
    setStep("loading");
    try {
      await fetchAndUseNewPrompt();
      setStep("drawing");
    } catch {
      setStep("error");
    }
  }

  function handleSubmit() {
    if (strokesRef.current.length === 0 || strokesRef.current.every((s) => s.points.length < 2)) {
      return; // empty canvas
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Capture recording JSON against the current canvas dimensions so the
    // replay knows the original aspect ratio and can scale to fit.
    const recording: Recording = {
      v: 1,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      bgColor,
      durationMs: lastTRef.current,
      strokes: strokesRef.current,
    };
    recordingBlobRef.current = new Blob([JSON.stringify(recording)], {
      type: "application/json",
    });
    // Capture the PNG NOW — the canvas is unmounted once step !== "drawing".
    canvas.toBlob((blob) => {
      if (!blob) {
        setSubmitError("Failed to capture drawing");
        return;
      }
      drawingBlobRef.current = blob;
      setStep("sharing");
      fetch("/api/contacts")
        .then((r) => (r.ok ? r.json() as Promise<Contact[]> : Promise.resolve([])))
        .then((data) => setContacts(data))
        .catch(() => {});
    }, "image/png");
  }

  async function handleSend() {
    if (!selectedReceiver) return;
    const blob = drawingBlobRef.current;
    if (!blob) { setSubmitError("Drawing not captured"); return; }

    setSubmitting(true);
    setSubmitError("");
    try {
      const fd = new FormData();
      fd.append("file", blob, "scribble.png");
      if (recordingBlobRef.current) {
        fd.append("recording", recordingBlobRef.current, "scribble.json");
      }
      if (!promptId) {
        setSubmitError("Missing prompt");
        setSubmitting(false);
        return;
      }
      fd.append("promptId", promptId);
      fd.append("receiverUsername", selectedReceiver.username);

      const res = await fetch("/api/scribble/submit", { method: "POST", body: fd });
      if (res.ok) {
        clearDraft();
        setStep("done");
      } else {
        const data = await (res.json() as Promise<{ error?: string }>).catch(() => ({ error: "Unknown error" }));
        setSubmitError(data.error ?? "Failed to send");
      }
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  // --- User search --------------------------------------------------------------

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() as Promise<Contact[]> : Promise.resolve([])))
      .then((data) => setSearchResults(data))
      .catch(() => {})
      .finally(() => setSearching(false));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-start gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0" style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}>
        <button
          onClick={() => {
            if (step === "sharing") {
              // Submitted the drawing but not yet sent → back to drawing.
              setStep("drawing");
              setSubmitError("");
            } else {
              onClose();
            }
          }}
          className="text-white text-2xl leading-none opacity-60 hover:opacity-100 shrink-0"
          aria-label={step === "sharing" ? "Back to drawing" : "Close"}
        >
          {step === "sharing" ? "←" : "×"}
        </button>

        {step === "loading" && (
          <p className="flex-1 text-sm text-gray-400 animate-pulse text-center py-2">出题中…</p>
        )}
        {step === "error" && (
          <p className="flex-1 text-sm text-red-400 text-center py-2">
            Failed to load. <button onClick={onClose} className="underline">Close</button>
          </p>
        )}

        {(step === "drawing" || step === "sharing" || step === "done") && (
          <div className="flex-1 grid grid-cols-2 gap-3 min-w-0">
            {/* LEFT: category badge + answer word */}
            <div className="text-center min-w-0">
              <p
                className={`inline-block px-2 py-0.5 rounded-full bg-gray-700 text-[10px] text-gray-200 tracking-wider transition-opacity ${rerolling ? "opacity-30" : ""}`}
              >
                {category || "类别"}
              </p>
              <p
                className={`text-2xl font-bold tracking-wider mt-0.5 transition-opacity ${rerolling ? "opacity-30" : ""}`}
              >
                {word}
              </p>
            </div>

            {/* RIGHT: drawer description + reroll button */}
            <div className="text-left text-[11px] leading-snug min-w-0 space-y-1">
              {drawerDescription && (
                <p
                  className={`text-gray-300 line-clamp-3 transition-opacity ${rerolling ? "opacity-30" : ""}`}
                  title={drawerDescription}
                >
                  {drawerDescription}
                </p>
              )}
              {step === "drawing" && (
                <button
                  onClick={() => void handleRerollPrompt()}
                  disabled={rerollsLeft === 0 || rerolling}
                  className="text-blue-300 hover:text-blue-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {rerollsLeft === 0
                    ? "没有机会了"
                    : rerolling
                      ? "换一题…"
                      : `🔄 换一题 (剩 ${rerollsLeft})`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Step: drawing */}
      {step === "drawing" && (
        <>
          {/* Toolbar */}
          <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 shrink-0 space-y-2">
            {/* Background colors */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 w-8 shrink-0">BG</span>
              {BG_COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                    bgColor === c ? "border-white scale-110" : "border-gray-600"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setBgColor(c)}
                />
              ))}
            </div>

            {/* Brush colors + eraser */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 w-8 shrink-0">Brush</span>
              {BRUSH_COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                    !isErasing && brushColor === c ? "border-white scale-110" : "border-gray-600"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => { setBrushColor(c); setIsErasing(false); }}
                />
              ))}
              <button
                aria-label="Eraser"
                title="Eraser"
                onClick={() => setIsErasing(true)}
                className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                  isErasing ? "border-white scale-110" : "border-gray-600"
                }`}
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(45deg, #FFFFFF 0px, #FFFFFF 2px, #6B7280 2px, #6B7280 4px)",
                }}
              />
            </div>

            {/* Brush size */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-8 shrink-0">Size</span>
              <input
                type="range"
                min="1"
                max="20"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="flex-1 h-1 accent-white"
              />
              <span
                className="shrink-0 rounded-full border border-gray-500"
                style={{
                  width: brushSize + 4,
                  height: brushSize + 4,
                  backgroundColor: isErasing ? bgColor : brushColor,
                  ...(isErasing
                    ? {
                        backgroundImage:
                          "repeating-linear-gradient(45deg, #FFFFFF 0px, #FFFFFF 2px, #6B7280 2px, #6B7280 4px)",
                      }
                    : {}),
                }}
              />
            </div>
          </div>

          {/* Timer bar — 75s countdown with pause/resume. Color hardens as
              time runs low so peripheral vision picks it up. */}
          {(() => {
            const seconds = Math.ceil(timeLeftMs / 1000);
            const ratio = Math.max(0, Math.min(1, timeLeftMs / TIMER_TOTAL_MS));
            const tone =
              timerState === "expired"
                ? { ring: "ring-red-500", text: "text-red-400", bar: "bg-red-500" }
                : seconds <= 10
                ? { ring: "ring-red-400", text: "text-red-300", bar: "bg-red-400" }
                : seconds <= 30
                ? { ring: "ring-yellow-400", text: "text-yellow-300", bar: "bg-yellow-400" }
                : { ring: "ring-gray-600", text: "text-gray-100", bar: "bg-emerald-400" };
            return (
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
                <div className={`tabular-nums text-xl font-bold w-12 text-center ${tone.text}`}>
                  {seconds}
                  <span className="text-[10px] font-normal text-gray-500 ml-0.5">s</span>
                </div>
                <div className={`flex-1 h-2 rounded-full bg-gray-800 ring-1 ${tone.ring} overflow-hidden`}>
                  <div
                    className={`h-full ${tone.bar} transition-[width] duration-100 linear`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
                {timerState === "expired" ? (
                  <span className="text-xs font-semibold text-red-400 shrink-0">时间到!</span>
                ) : timerState === "running" ? (
                  <button
                    onClick={pauseTimer}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-white shrink-0"
                    aria-label="暂停计时"
                    title="暂停计时"
                  >
                    ❚❚
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (timerStateRef.current === "idle") startTimer();
                      else resumeTimer();
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
                    aria-label={timerState === "idle" ? "开始计时" : "继续计时"}
                    title={timerState === "idle" ? "开始计时" : "继续计时"}
                  >
                    ▶
                  </button>
                )}
              </div>
            );
          })()}

          {/* Canvas — touch handlers attached via useEffect (non-passive).
              Pointer events are blocked once the timer expires so no extra
              strokes sneak in after time's up. */}
          <canvas
            ref={canvasRef}
            className="w-full touch-none"
            style={{
              flex: 1,
              backgroundColor: bgColor,
              pointerEvents: timerState === "expired" ? "none" : "auto",
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
          />

          {/* Actions */}
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border-t border-gray-700 shrink-0">
            <button
              onClick={() => void handleDeleteDraft()}
              title="删除草稿，换新成语"
              aria-label="Delete draft"
              className="px-3 py-2 text-sm text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700"
            >
              🗑
            </button>
            <button
              onClick={handleClear}
              className="px-3 py-2 text-sm text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700"
            >
              Clear
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 py-2 text-sm font-semibold bg-[#2B4B8C] text-white rounded-lg hover:bg-[#1e3a70] transition-colors"
            >
              Submit
            </button>
          </div>
        </>
      )}

      {/* Step: sharing (pick receiver) */}
      {step === "sharing" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-sm text-gray-300 mb-2">Send to...</p>
            <input
              type="text"
              placeholder="Search username..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#2B4B8C]"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2">
            {searchQuery.length > 0 ? (
              searching ? (
                <p className="text-sm text-gray-400 text-center py-4">Searching...</p>
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No users found</p>
              ) : (
                searchResults.map((u) => (
                  <button
                    key={u.username}
                    onClick={() => setSelectedReceiver(u)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${
                      selectedReceiver?.username === u.username
                        ? "bg-[#2B4B8C] text-white"
                        : "hover:bg-gray-700"
                    }`}
                  >
                    <span className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm font-bold shrink-0">
                      {u.displayName.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{u.displayName}</p>
                      <p className="text-xs text-gray-400">@{u.username}</p>
                    </div>
                  </button>
                ))
              )
            ) : contacts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No recent contacts. Search for a user by username.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-2">Recent contacts</p>
                {contacts.map((u) => (
                  <button
                    key={u.username}
                    onClick={() => setSelectedReceiver(u)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${
                      selectedReceiver?.username === u.username
                        ? "bg-[#2B4B8C] text-white"
                        : "hover:bg-gray-700"
                    }`}
                  >
                    <span className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm font-bold shrink-0">
                      {u.displayName.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{u.displayName}</p>
                      <p className="text-xs text-gray-400">@{u.username}</p>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-700 shrink-0 space-y-2">
            {submitError && <p className="text-sm text-red-400">{submitError}</p>}
            <button
              onClick={handleSend}
              disabled={!selectedReceiver || submitting}
              className="w-full py-2.5 text-sm font-semibold bg-[#2B4B8C] text-white rounded-lg hover:bg-[#1e3a70] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Sending..." : "Send Scribble"}
            </button>
            <button
              onClick={() => setStep("drawing")}
              className="w-full py-2 text-sm text-gray-400 hover:text-white"
            >
              Back to drawing
            </button>
          </div>
        </div>
      )}

      {/* Step: done */}
      {step === "done" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <p className="text-4xl">✏️</p>
          <p className="text-lg font-semibold">Scribble sent!</p>
          <p className="text-sm text-gray-400">
            @{selectedReceiver?.username} will see your drawing of <strong>{word}</strong>
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[#2B4B8C] text-white rounded-lg font-semibold hover:bg-[#1e3a70] transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}