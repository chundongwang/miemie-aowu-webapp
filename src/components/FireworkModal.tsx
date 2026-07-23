"use client";

import { useEffect, useRef, useState } from "react";

// The sentence, one line per row. Each word gets its own firework, fired in
// reading order, so the sentence assembles itself burst by burst. Kept to
// three short lines so each word renders large enough to read on a phone.
const LINES = ["Be happy.", "Even just today", "is okay."] as const;

const ROCKET_DUR = 600; // ms for a rocket to rise to its word
const INTERVAL = 1050; // ms between successive rocket launches

type RGB = [number, number, number];
type Pt = { x: number; y: number };
type Part = { x: number; y: number; vx: number; vy: number; tx: number; ty: number; col: RGB; seed: number };
type Spark = { x: number; y: number; vx: number; vy: number; col: RGB; life: number; decay: number; size: number };
type Word = {
  pts: Pt[];
  cx: number; // burst center
  cy: number;
  parts: Part[];
  state: "waiting" | "rocket" | "burst" | "hold";
  burstTime: number;
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
    let words: Word[] = [];
    let ambient: Spark[] = [];
    let launched = 0;
    let lastLaunch = 0;
    let rocket: { x: number; y: number; y0: number; t0: number; wi: number } | null = null;
    let lastAmbient = 0;
    let raf = 0;

    const font = (s: number) => `700 ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`;

    // ---- layout: sample every word into target points ---------------------
    function sampleWord(tok: string, size: number, left: number, centerY: number, lh: number): Pt[] {
      const measurer = document.createElement("canvas").getContext("2d")!;
      measurer.font = font(size);
      const pad = 4;
      const cw = Math.ceil(measurer.measureText(tok).width) + pad * 2;
      const ch = Math.ceil(lh);
      const c = document.createElement("canvas");
      c.width = cw;
      c.height = ch;
      const cx = c.getContext("2d")!;
      cx.font = font(size);
      cx.textAlign = "left";
      cx.textBaseline = "middle";
      cx.fillStyle = "#fff";
      cx.fillText(tok, pad, ch / 2);
      const data = cx.getImageData(0, 0, cw, ch).data;
      const step = size > 44 ? 6 : 5;
      const pts: Pt[] = [];
      const worldTop = centerY - ch / 2;
      for (let y = 0; y < ch; y += step) {
        for (let x = 0; x < cw; x += step) {
          if (data[(y * cw + x) * 4 + 3] > 130) {
            pts.push({
              x: left - pad + x + (Math.random() - 0.5) * step * 0.35,
              y: worldTop + y + (Math.random() - 0.5) * step * 0.35,
            });
          }
        }
      }
      return pts;
    }

    function computeWords(): Word[] {
      const octx = document.createElement("canvas").getContext("2d")!;
      let size = Math.min(72, h * 0.13);
      for (; size > 14; size -= 1) {
        octx.font = font(size);
        const widest = Math.max(...LINES.map((l) => octx.measureText(l).width));
        if (widest <= w * 0.84) break;
      }
      octx.font = font(size);
      const spaceW = octx.measureText(" ").width;
      const lh = size * 1.3;
      const totalH = lh * LINES.length;
      const firstCenter = h * 0.46 - totalH / 2 + lh / 2;

      const out: Word[] = [];
      LINES.forEach((line, li) => {
        const centerY = firstCenter + li * lh;
        const toks = line.split(" ");
        const widths = toks.map((t) => octx.measureText(t).width);
        const lineW = widths.reduce((a, b) => a + b, 0) + spaceW * (toks.length - 1);
        let x = (w - lineW) / 2;
        toks.forEach((tok, ti) => {
          const pts = sampleWord(tok, size, x, centerY, lh);
          out.push({ pts, cx: x + widths[ti] / 2, cy: centerY, parts: [], state: "waiting", burstTime: 0 });
          x += widths[ti] + spaceW;
        });
      });
      return out;
    }

    function remapWord(wd: Word, pts: Pt[]) {
      if (wd.parts.length === pts.length) {
        pts.forEach((p, i) => {
          wd.parts[i].tx = p.x;
          wd.parts[i].ty = p.y;
        });
      } else {
        const old = wd.parts;
        wd.parts = pts.map((p, i) => {
          const src = old[i] ?? old[old.length - 1];
          return {
            x: src?.x ?? wd.cx,
            y: src?.y ?? wd.cy,
            vx: 0,
            vy: 0,
            tx: p.x,
            ty: p.y,
            col: src?.col ?? pickTextCol(),
            seed: src?.seed ?? Math.random() * 6.28,
          };
        });
      }
      wd.pts = pts;
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

      if (words.length === 0) {
        words = computeWords();
      } else if (widthChanged) {
        const fresh = computeWords();
        words.forEach((wd, i) => {
          wd.cx = fresh[i].cx;
          wd.cy = fresh[i].cy;
          if (wd.state === "waiting") wd.pts = fresh[i].pts;
          else remapWord(wd, fresh[i].pts);
        });
      }
    }

    // ---- sparks & particles ----------------------------------------------
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

    function igniteWord(wd: Word, now: number) {
      wd.state = "burst";
      wd.burstTime = now;
      wd.parts = wd.pts.map((p) => {
        const ang = Math.random() * Math.PI * 2;
        const spd = 3 + Math.random() * 8;
        return {
          x: wd.cx,
          y: wd.cy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          tx: p.x,
          ty: p.y,
          col: pickTextCol(),
          seed: Math.random() * 6.28,
        };
      });
      ambient.push(...spawnSparks(wd.cx, wd.cy, 64, 1));
    }

    function drawGlow(x: number, y: number, r: number, col: RGB, a: number) {
      ctx!.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a * 0.18})`;
      ctx!.beginPath();
      ctx!.arc(x, y, r * 1.7, 0, 6.2832);
      ctx!.fill();
      ctx!.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
      ctx!.beginPath();
      ctx!.arc(x, y, r, 0, 6.2832);
      ctx!.fill();
    }

    function updateSparks(now: number) {
      for (let i = ambient.length - 1; i >= 0; i--) {
        const s = ambient[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.06;
        s.vx *= 0.985;
        s.vy *= 0.985;
        s.life -= s.decay;
        if (s.life <= 0) {
          ambient.splice(i, 1);
          continue;
        }
        drawGlow(s.x, s.y, s.size, s.col, Math.max(0, s.life));
      }
    }

    // ---- init -------------------------------------------------------------
    layout();
    const startTime = performance.now();
    if (reduced) {
      words.forEach((wd) => {
        wd.state = "hold";
        wd.parts = wd.pts.map((p) => ({
          x: p.x,
          y: p.y,
          vx: 0,
          vy: 0,
          tx: p.x,
          ty: p.y,
          col: pickTextCol(),
          seed: Math.random() * 6.28,
        }));
      });
      launched = words.length;
    } else {
      words[0].state = "rocket";
      rocket = { x: words[0].cx, y: h + 12, y0: h + 12, t0: startTime, wi: 0 };
      launched = 1;
      lastLaunch = startTime;
    }

    function frame(now: number) {
      ctx!.globalCompositeOperation = "source-over";
      ctx!.fillStyle = "rgba(4,6,16,0.22)";
      ctx!.fillRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "lighter";

      // Launch the next word's rocket on a steady cadence.
      if (!reduced && launched < words.length && now - lastLaunch >= INTERVAL) {
        const wd = words[launched];
        wd.state = "rocket";
        rocket = { x: wd.cx, y: h + 12, y0: h + 12, t0: now, wi: launched };
        launched++;
        lastLaunch = now;
      }

      // Ambient sparkle in the sky for atmosphere.
      if (!reduced && now - lastAmbient > 1600) {
        lastAmbient = now;
        ambient.push(...spawnSparks(w * (0.18 + Math.random() * 0.64), h * (0.12 + Math.random() * 0.28), 40, 0.8));
      }
      updateSparks(now);

      // Active rocket rising to its word.
      if (rocket) {
        const wd = words[rocket.wi];
        const p = Math.min(1, Math.max(0, (now - rocket.t0) / ROCKET_DUR));
        rocket.y = rocket.y0 + (wd.cy - rocket.y0) * easeOutCubic(p);
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
          igniteWord(wd, now);
          rocket = null;
        }
      }

      // Every word that has burst: expand outward, then gather into shape.
      for (const wd of words) {
        if (wd.state !== "burst" && wd.state !== "hold") continue;
        const age = now - wd.burstTime;
        let settled = 0;
        for (const q of wd.parts) {
          const expand = 180 + (q.seed % 1) * 140;
          if (!reduced && age < expand) {
            q.x += q.vx;
            q.y += q.vy;
            q.vx *= 0.94;
            q.vy *= 0.94;
          } else {
            q.vx = (q.vx + (q.tx - q.x) * 0.022) * 0.9;
            q.vy = (q.vy + (q.ty - q.y) * 0.022) * 0.9;
            q.x += q.vx;
            q.y += q.vy;
            if ((q.tx - q.x) ** 2 + (q.ty - q.y) ** 2 < 1.2) settled++;
          }
          const tw = wd.state === "hold" ? 0.72 + 0.28 * Math.sin(now * 0.006 + q.seed) : 1;
          drawGlow(q.x, q.y, 1.5, q.col, tw);
        }
        if (wd.state === "burst" && wd.parts.length && settled > wd.parts.length * 0.9) wd.state = "hold";
      }

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
