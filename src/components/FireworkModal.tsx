"use client";

import { useEffect, useRef, useState } from "react";

// The two lines the firework resolves into.
const LINES = ["Be happy.", "Even just today is okay."] as const;

type RGB = [number, number, number];
type Part = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  col: RGB;
  seed: number;
};
type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  col: RGB;
  life: number;
  decay: number;
  size: number;
};

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

// Mostly warm-white so the words stay legible, with a few colored accents.
const pickTextCol = (): RGB => {
  const r = Math.random();
  if (r < 0.68) return [255, 226, 170];
  if (r < 0.85) return [255, 240, 214];
  if (r < 0.95) return [255, 176, 206];
  return [176, 204, 255];
};
const SPARK_PALETTE: RGB[] = [
  [255, 178, 92],
  [255, 96, 146],
  [122, 200, 255],
  [180, 255, 160],
  [255, 228, 120],
];

export default function FireworkModal({ onClose, closeLabel }: { onClose: () => void; closeLabel: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setFailed(true);
      return;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let w = 0;
    let h = 0;
    let textPts: { x: number; y: number }[] = [];
    let burst = { x: 0, y: 0 };
    let parts: Part[] = [];
    let decor: Spark[] = [];
    let ambient: Spark[] = [];
    let phase: "rocket" | "burst" | "hold" = "rocket";
    let rocket = { x0: 0, y0: 0, x: 0, y: 0, t0: 0, dur: 720 };
    let burstTime = 0;
    let lastAmbient = 0;
    let raf = 0;

    // ---- text sampling ----------------------------------------------------
    function sampleText(): { pts: { x: number; y: number }[]; centerY: number } {
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.round(w));
      off.height = Math.max(1, Math.round(h));
      const octx = off.getContext("2d");
      if (!octx) return { pts: [], centerY: h * 0.46 };

      const font = (s: number) => `700 ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      const longest = LINES.reduce((a, b) => (b.length > a.length ? b : a), "");
      const maxW = w * 0.84;
      let size = Math.min(72, h * 0.13);
      for (; size > 14; size -= 1) {
        octx.font = font(size);
        if (octx.measureText(longest).width <= maxW) break;
      }
      octx.font = font(size);
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.fillStyle = "#fff";
      const lh = size * 1.3;
      const totalH = lh * LINES.length;
      const centerY = h * 0.46;
      const top = centerY - totalH / 2 + lh / 2;
      LINES.forEach((line, i) => octx.fillText(line, w / 2, top + i * lh));

      const data = octx.getImageData(0, 0, off.width, off.height).data;
      const step = size > 44 ? 5 : 4;
      const pts: { x: number; y: number }[] = [];
      for (let y = 0; y < off.height; y += step) {
        for (let x = 0; x < off.width; x += step) {
          if (data[(y * off.width + x) * 4 + 3] > 130) {
            pts.push({
              x: x + (Math.random() - 0.5) * step * 0.7,
              y: y + (Math.random() - 0.5) * step * 0.7,
            });
          }
        }
      }
      // Cap the particle count so mid-range phones stay at 60fps.
      const MAX = 1100;
      if (pts.length > MAX) {
        const stride = Math.ceil(pts.length / MAX);
        return { pts: pts.filter((_, i) => i % stride === 0), centerY };
      }
      return { pts, centerY };
    }

    function layout() {
      const rect = canvas!.getBoundingClientRect();
      const widthChanged = Math.abs(rect.width - w) > 4;
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (widthChanged || textPts.length === 0) {
        const s = sampleText();
        textPts = s.pts;
        burst = { x: w / 2, y: s.centerY };
        // Re-point existing particles at the fresh targets (resize while showing).
        if (phase !== "rocket") {
          if (parts.length !== textPts.length) {
            const old = parts;
            parts = textPts.map((p, i) => {
              const src = old[i] ?? old[old.length - 1];
              return {
                x: src?.x ?? burst.x,
                y: src?.y ?? burst.y,
                vx: src?.vx ?? 0,
                vy: src?.vy ?? 0,
                tx: p.x,
                ty: p.y,
                col: src?.col ?? pickTextCol(),
                seed: src?.seed ?? Math.random() * 6.28,
              };
            });
          } else {
            parts.forEach((q, i) => {
              q.tx = textPts[i].x;
              q.ty = textPts[i].y;
            });
          }
        }
      }
    }

    // ---- spark helpers ----------------------------------------------------
    function spawnSparks(x: number, y: number, n: number, power: number): Spark[] {
      const out: Spark[] = [];
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (1.4 + Math.random() * 6) * power;
        out.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 0.6,
          col: SPARK_PALETTE[(Math.random() * SPARK_PALETTE.length) | 0],
          life: 1,
          decay: 0.012 + Math.random() * 0.02,
          size: 1 + Math.random() * 1.6,
        });
      }
      return out;
    }

    function ignite(now: number) {
      burstTime = now;
      parts = textPts.map((p) => {
        const ang = Math.random() * Math.PI * 2;
        const spd = 3 + Math.random() * 9;
        return {
          x: burst.x,
          y: burst.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          tx: p.x,
          ty: p.y,
          col: pickTextCol(),
          seed: Math.random() * 6.28,
        };
      });
      decor = spawnSparks(burst.x, burst.y, 120, 1);
    }

    function drawGlow(x: number, y: number, r: number, col: RGB, a: number) {
      ctx!.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a * 0.28})`;
      ctx!.beginPath();
      ctx!.arc(x, y, r * 2.4, 0, 6.2832);
      ctx!.fill();
      ctx!.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
      ctx!.beginPath();
      ctx!.arc(x, y, r, 0, 6.2832);
      ctx!.fill();
    }

    function drawDot(x: number, y: number, r: number, col: RGB, a: number) {
      ctx!.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
      ctx!.beginPath();
      ctx!.arc(x, y, r, 0, 6.2832);
      ctx!.fill();
    }

    function updateSparks(arr: Spark[]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const s = arr[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.06;
        s.vx *= 0.985;
        s.vy *= 0.985;
        s.life -= s.decay;
        if (s.life <= 0) {
          arr.splice(i, 1);
          continue;
        }
        drawDot(s.x, s.y, s.size, s.col, Math.max(0, s.life));
      }
    }

    // ---- init -------------------------------------------------------------
    layout();
    const startTime = performance.now();
    if (reduced) {
      parts = textPts.map((p) => ({
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        tx: p.x,
        ty: p.y,
        col: pickTextCol(),
        seed: Math.random() * 6.28,
      }));
      burstTime = startTime;
      phase = "hold";
    } else {
      rocket = { x0: w / 2, y0: h + 12, x: w / 2, y: h + 12, t0: startTime + 140, dur: 720 };
      phase = "rocket";
    }

    function frame(now: number) {
      // Trails + dark backdrop in one translucent wash.
      ctx!.globalCompositeOperation = "source-over";
      ctx!.fillStyle = "rgba(4,6,16,0.22)";
      ctx!.fillRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "lighter";

      if (phase === "hold" && !reduced && now - lastAmbient > 1500) {
        lastAmbient = now;
        ambient.push(
          ...spawnSparks(w * (0.18 + Math.random() * 0.64), h * (0.14 + Math.random() * 0.3), 46, 0.85)
        );
      }
      updateSparks(ambient);

      if (phase === "rocket") {
        const p = Math.min(1, Math.max(0, (now - rocket.t0) / rocket.dur));
        const e = easeOutCubic(p);
        rocket.x = rocket.x0 + (burst.x - rocket.x0) * e;
        rocket.y = rocket.y0 + (burst.y - rocket.y0) * e;
        drawGlow(rocket.x, rocket.y, 2.2, [255, 236, 190], 1);
        if (Math.random() < 0.9) {
          ambient.push({
            x: rocket.x + (Math.random() - 0.5) * 3,
            y: rocket.y + Math.random() * 5,
            vx: (Math.random() - 0.5) * 0.6,
            vy: 0.5 + Math.random(),
            col: [255, 210, 150],
            life: 0.8,
            decay: 0.05,
            size: 1,
          });
        }
        if (p >= 1) {
          phase = "burst";
          ignite(now);
        }
      }

      if (phase === "burst" || phase === "hold") {
        const age = now - burstTime;
        let settled = 0;
        for (const q of parts) {
          const expand = 220 + (q.seed % 1) * 160;
          if (!reduced && age < expand) {
            q.x += q.vx;
            q.y += q.vy;
            q.vx *= 0.94;
            q.vy *= 0.94;
          } else {
            q.vx = (q.vx + (q.tx - q.x) * 0.02) * 0.9;
            q.vy = (q.vy + (q.ty - q.y) * 0.02) * 0.9;
            q.x += q.vx;
            q.y += q.vy;
            if ((q.tx - q.x) ** 2 + (q.ty - q.y) ** 2 < 1.2) settled++;
          }
          const tw = phase === "hold" ? 0.72 + 0.28 * Math.sin(now * 0.006 + q.seed) : 1;
          drawGlow(q.x, q.y, 1.5, q.col, tw);
        }
        if (phase === "burst" && parts.length && settled > parts.length * 0.9) phase = "hold";
      }

      updateSparks(decor);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(layout, 120);
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60]"
      style={{ background: "radial-gradient(circle at 50% 45%, #0d1630 0%, #04060e 78%)" }}
      role="dialog"
      aria-modal="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
          {LINES.map((line) => (
            <p key={line} className="text-xl font-semibold text-amber-100 drop-shadow-[0_0_12px_rgba(255,210,140,0.6)]">
              {line}
            </p>
          ))}
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
