"use client";

import { useEffect, useRef, useState } from "react";
import { MinionSim } from "@/lib/cursorMinions/sim";

export default function CursorMinionsModal({
  onClose,
  closeLabel,
  hint,
  doneHint,
  fastForwardMs = 0,
}: {
  onClose: () => void;
  closeLabel: string;
  hint: string;
  doneHint: string;
  /** Dev/preview only: step the swarm this far before the first frame. */
  fastForwardMs?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<MinionSim | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let sim: MinionSim;
    try {
      sim = new MinionSim(canvas, { onComplete: () => setDone(true) });
    } catch {
      return;
    }
    simRef.current = sim;
    sim.start();
    if (fastForwardMs > 0) sim.advance(fastForwardMs);
    return () => {
      sim.stop();
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60]" style={{ background: "#0b0b0e" }} role="dialog" aria-modal="true">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none", cursor: "none" }}
        onPointerDown={() => {
          setDone(false);
          simRef.current?.restart();
        }}
      />

      <button
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white/90 backdrop-blur-sm transition-colors hover:bg-white/25"
        style={{ top: "calc(env(safe-area-inset-top) + 1.25rem)" }}
      >
        ✕
      </button>

      <p
        className="pointer-events-none absolute inset-x-0 text-center text-xs tracking-wide text-white/40 transition-opacity duration-700"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
      >
        {done ? doneHint : hint}
      </p>
    </div>
  );
}
