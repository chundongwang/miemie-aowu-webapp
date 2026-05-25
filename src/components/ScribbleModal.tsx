"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Stroke = {
  color: string;
  size: number;
  points: { x: number; y: number }[];
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

export default function ScribbleModal({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const redrawRef = useRef<() => void>(() => {});
  // Holds the rendered PNG once the user leaves the drawing step. The canvas
  // is unmounted while step !== "drawing", so we must capture before transition.
  const drawingBlobRef = useRef<Blob | null>(null);

  const [step, setStep] = useState<Step>("loading");
  const [idiomId, setIdiomId] = useState<number | null>(null);
  const [idiom, setIdiom] = useState("");
  const [pinyin, setPinyin] = useState("");
  const [explanation, setExplanation] = useState("");
  const [example, setExample] = useState("");

  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(3);

  const [submitting, setSubmitting] = useState(false);
  const [skipsLeft, setSkipsLeft] = useState(3);
  const [skipping, setSkipping] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedReceiver, setSelectedReceiver] = useState<Contact | null>(null);
  const [submitError, setSubmitError] = useState("");

  // Fetch idiom on mount (guard against StrictMode double-invoke)
  const hasFetchedWordRef = useRef(false);
  useEffect(() => {
    if (hasFetchedWordRef.current) return;
    hasFetchedWordRef.current = true;
    fetch("/api/scribble/word")
      .then((r) => r.json() as Promise<{ idiomId: number; idiom: string; pinyin: string; explanation: string; example: string }>)
      .then((data) => {
        setIdiomId(data.idiomId);
        setIdiom(data.idiom);
        setPinyin(data.pinyin);
        setExplanation(data.explanation);
        setExample(data.example);
        setStep("drawing");
      })
      .catch(() => setStep("error"));
  }, []);

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
      ctx.strokeStyle = stroke.color;
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

  function startDraw(x: number, y: number) {
    isDrawingRef.current = true;
    lastPosRef.current = { x, y };
    strokesRef.current.push({ color: brushColor, size: brushSize, points: [{ x, y }] });
  }

  function moveDraw(x: number, y: number) {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const last = lastPosRef.current;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPosRef.current = { x, y };
    const currentStroke = strokesRef.current[strokesRef.current.length - 1];
    currentStroke.points.push({ x, y });
  }

  function endDraw() {
    isDrawingRef.current = false;
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
  }, [step, brushColor, brushSize]);

  // --- Actions ------------------------------------------------------------------

  function handleClear() {
    strokesRef.current = [];
    redraw();
  }

  async function handleSkipIdiom() {
    if (skipsLeft <= 0 || skipping) return;
    setSkipping(true);
    try {
      const res = await fetch("/api/scribble/word");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { idiomId: number; idiom: string; pinyin: string; explanation: string; example: string };
      setIdiomId(data.idiomId);
      setIdiom(data.idiom);
      setPinyin(data.pinyin);
      setExplanation(data.explanation);
      setExample(data.example);
      // Different idiom → wipe canvas so the drawing matches the prompt.
      strokesRef.current = [];
      redraw();
      setSkipsLeft((n) => n - 1);
    } catch {
      // ignore — keep the current idiom
    }
    setSkipping(false);
  }

  function handleSubmit() {
    if (strokesRef.current.length === 0 || strokesRef.current.every((s) => s.points.length < 2)) {
      return; // empty canvas
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
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
      if (idiomId == null) {
        setSubmitError("Missing idiom");
        setSubmitting(false);
        return;
      }
      fd.append("idiomId", String(idiomId));
      fd.append("receiverUsername", selectedReceiver.username);

      const res = await fetch("/api/scribble/submit", { method: "POST", body: fd });
      if (res.ok) {
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
          onClick={onClose}
          className="text-white text-2xl leading-none opacity-60 hover:opacity-100 shrink-0"
          aria-label="Close"
        >
          ×
        </button>

        {step === "loading" && (
          <p className="flex-1 text-sm text-gray-400 animate-pulse text-center py-2">抽取成语中…</p>
        )}
        {step === "error" && (
          <p className="flex-1 text-sm text-red-400 text-center py-2">
            Failed to load. <button onClick={onClose} className="underline">Close</button>
          </p>
        )}

        {(step === "drawing" || step === "sharing" || step === "done") && (
          <div className="flex-1 grid grid-cols-2 gap-3 min-w-0">
            {/* LEFT: idiom */}
            <div className="text-center min-w-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">画这个成语</p>
              <p
                className={`text-2xl font-bold tracking-wider transition-opacity ${skipping ? "opacity-30" : ""}`}
              >
                {idiom}
              </p>
              {pinyin && (
                <p
                  className={`text-[11px] text-gray-300 mt-0.5 break-words transition-opacity ${skipping ? "opacity-30" : ""}`}
                >
                  {pinyin}
                </p>
              )}
            </div>

            {/* RIGHT: explanation / example / refresh */}
            <div className="text-left text-[11px] leading-snug min-w-0 space-y-1">
              {explanation && (
                <p
                  className={`text-gray-300 line-clamp-2 transition-opacity ${skipping ? "opacity-30" : ""}`}
                >
                  {explanation}
                </p>
              )}
              {example && (
                <p
                  className={`text-gray-500 line-clamp-2 transition-opacity ${skipping ? "opacity-30" : ""}`}
                  title={example}
                >
                  <span className="text-gray-400">例：</span>{example}
                </p>
              )}
              {step === "drawing" && (
                <button
                  onClick={() => void handleSkipIdiom()}
                  disabled={skipsLeft === 0 || skipping}
                  className="text-blue-300 hover:text-blue-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {skipsLeft === 0
                    ? "没有机会了"
                    : skipping
                      ? "换一个…"
                      : `🔄 换一个 (剩 ${skipsLeft})`}
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

            {/* Brush colors */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 w-8 shrink-0">Brush</span>
              {BRUSH_COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                    brushColor === c ? "border-white scale-110" : "border-gray-600"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setBrushColor(c)}
                />
              ))}
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
                  backgroundColor: brushColor,
                }}
              />
            </div>
          </div>

          {/* Canvas — touch handlers attached via useEffect (non-passive) */}
          <canvas
            ref={canvasRef}
            className="w-full touch-none"
            style={{ flex: 1, backgroundColor: bgColor }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
          />

          {/* Actions */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-t border-gray-700 shrink-0">
            <button
              onClick={handleClear}
              className="px-4 py-2 text-sm text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700"
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
            @{selectedReceiver?.username} will see your drawing of <strong>{idiom}</strong>
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