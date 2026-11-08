import { layoutJobs, type Job } from "./layout";
import type { Pt } from "./hanziData";

/**
 * A swarm of mouse cursors that collectively drag out a message, stroke by stroke.
 *
 * Pipeline (after Raven Kwok's "cursor minions"):
 *   text → stroke medians → short polyline jobs → each idle cursor claims the nearest unclaimed job,
 *   walks there on a grid (thin grey commute trail), then drags along it (thick ink trail).
 */

type Phase = "idle" | "commute" | "work" | "celebrate" | "gohome" | "home";

type Cursor = {
  x: number;
  y: number;
  /** Axis-locked walking: which axis we're on and how far we'll go before reconsidering. */
  axis: "x" | "y";
  axisLeft: number;
  phase: Phase;
  job: Job | null;
  /** Index of the next polyline point to reach while working. */
  pi: number;
  /** Idle wander target. */
  tx: number;
  ty: number;
  /** When this cursor is next allowed to make a decision (ms, sim clock). */
  nextDecision: number;
  /** Sim-clock time at which this cursor clocks out and heads for the cave. */
  leaveAt: number;
  /** Per-cursor speed multiplier so the swarm doesn't move in lockstep. */
  tempo: number;
  /** Sprite flip for a bit of variety. */
  flip: boolean;
};

const COMMUTE_TRAIL = "rgba(255,255,255,0.15)";
/** How long the crew mills about after the last stroke before heading home. */
const CELEBRATE_MS = 2500;
/** Once everyone is home, the commute paths dim to this over DIM_MS so the message stands alone. */
const PATHS_DIM = 0.35;
const DIM_MS = 1500;

export type SimOptions = {
  /** Called once every job has been drawn. */
  onComplete?: () => void;
};

export class MinionSim {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  /** Ink layer: the strokes of the message. */
  private trail: HTMLCanvasElement;
  private tctx: CanvasRenderingContext2D;
  /** Path layer: the faint commute trails, dimmed once the crew is home. */
  private paths: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D;
  private cave = { x: 0, y: 0, r: 30 };
  private w = 0;
  private h = 0;
  private dpr = 1;
  private jobs: Job[] = [];
  private claimed = new Set<number>();
  private cell = 100;
  private cursors: Cursor[] = [];
  private raf = 0;
  private last = 0;
  private clock = 0;
  private completedAt: number | null = null;
  private settledAt: number | null = null;
  private ro: ResizeObserver | null = null;
  private opts: SimOptions;

  constructor(canvas: HTMLCanvasElement, opts: SimOptions = {}) {
    this.canvas = canvas;
    this.opts = opts;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas unavailable");
    this.ctx = ctx;
    this.trail = document.createElement("canvas");
    const tctx = this.trail.getContext("2d");
    if (!tctx) throw new Error("2d canvas unavailable");
    this.tctx = tctx;
    this.paths = document.createElement("canvas");
    const pctx = this.paths.getContext("2d");
    if (!pctx) throw new Error("2d canvas unavailable");
    this.pctx = pctx;
  }

  start() {
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.clock += dt * 1000;
      this.step(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.ro = null;
  }

  /** Step the simulation forward synchronously without rendering (previews, tests). */
  advance(ms: number) {
    const slice = 1 / 60;
    for (let t = 0; t < ms; t += slice * 1000) {
      this.clock += slice * 1000;
      this.step(slice);
    }
    this.draw();
  }

  /** Wipe the board and call the crew back out of the cave (used on tap). */
  restart() {
    for (const [cv, ctx] of [[this.trail, this.tctx], [this.paths, this.pctx]] as const) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    const { jobs, cell } = layoutJobs(this.w, this.h);
    this.jobs = jobs;
    this.cell = cell;
    this.cave = { x: 0, y: this.h * 0.78, r: Math.max(26, Math.min(48, cell * 0.3)) };
    this.claimed.clear();
    this.completedAt = null;
    this.settledAt = null;
    for (const c of this.cursors) {
      // Everyone starts tucked inside the cave and trickles out.
      c.x = this.cave.x + Math.random() * this.cave.r * 0.5;
      c.y = this.cave.y + (Math.random() - 0.5) * this.cave.r * 0.8;
      c.tx = c.x;
      c.ty = c.y;
      c.phase = "idle";
      c.job = null;
      c.nextDecision = this.clock + 300 + Math.random() * 2500;
    }
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (rect.width === this.w && rect.height === this.h && dpr === this.dpr) return;
    this.dpr = dpr;
    this.w = rect.width;
    this.h = rect.height;
    for (const cv of [this.canvas, this.trail, this.paths]) {
      cv.width = Math.round(this.w * this.dpr);
      cv.height = Math.round(this.h * this.dpr);
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.spawn();
    this.restart();
  }

  private spawn() {
    const n = Math.round(Math.min(40, Math.max(14, (this.w * this.h) / 16000)));
    this.cursors = [];
    for (let i = 0; i < n; i++) {
      const x = Math.random() * this.w;
      const y = Math.random() * this.h;
      this.cursors.push({
        x, y, tx: x, ty: y,
        axis: Math.random() < 0.5 ? "x" : "y",
        axisLeft: 0,
        phase: "idle",
        job: null,
        pi: 0,
        nextDecision: 0,
        leaveAt: 0,
        tempo: 0.8 + Math.random() * 0.5,
        flip: Math.random() < 0.3,
      });
    }
  }

  // ---- behaviour ---------------------------------------------------------

  private pickJob(c: Cursor): Job | null {
    let best: Job | null = null;
    let bestCost = Infinity;
    for (const j of this.jobs) {
      if (this.claimed.has(j.id)) continue;
      const [sx, sy] = j.pts[0];
      // Nearest wins, nudged toward stroke order so glyphs grow roughly the way they're written.
      const cost = Math.abs(sx - c.x) + Math.abs(sy - c.y) + j.order * this.cell * 0.02;
      if (cost < bestCost) {
        bestCost = cost;
        best = j;
      }
    }
    return best;
  }

  private claim(c: Cursor, j: Job) {
    this.claimed.add(j.id);
    c.job = j;
    c.pi = 0;
  }

  /**
   * Axis-locked walk toward (tx, ty): move along one axis for a random run, then reconsider.
   * This is what gives the trails their stair-stepped, "someone actually dragged this" look.
   * Returns true once the target is reached.
   */
  private walk(c: Cursor, tx: number, ty: number, speed: number, run: number, dt: number): boolean {
    const dx = tx - c.x;
    const dy = ty - c.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx + ady < 0.6) {
      c.x = tx;
      c.y = ty;
      return true;
    }
    let step = speed * c.tempo * dt;
    if ((c.axis === "x" && adx < 0.3) || (c.axis === "y" && ady < 0.3) || c.axisLeft <= 0) {
      c.axis = Math.random() < adx / (adx + ady) ? "x" : "y";
      c.axisLeft = run * (0.4 + Math.random() * 1.2);
    }
    while (step > 0) {
      const d = c.axis === "x" ? dx : dy;
      const rx = Math.abs(tx - c.x);
      const ry = Math.abs(ty - c.y);
      if (rx + ry < 1e-3) break;
      const remaining = c.axis === "x" ? rx : ry;
      if (remaining < 1e-3) {
        c.axis = c.axis === "x" ? "y" : "x";
        c.axisLeft = run * (0.4 + Math.random() * 1.2);
        continue;
      }
      const m = Math.min(step, remaining, c.axisLeft);
      if (c.axis === "x") c.x += Math.sign(d) * m;
      else c.y += Math.sign(d) * m;
      step -= m;
      c.axisLeft -= m;
      if (c.axisLeft <= 0) {
        const rdx = Math.abs(tx - c.x);
        const rdy = Math.abs(ty - c.y);
        if (rdx + rdy < 1e-3) break;
        c.axis = Math.random() < rdx / (rdx + rdy) ? "x" : "y";
        c.axisLeft = run * (0.4 + Math.random() * 1.2);
      }
    }
    return Math.abs(tx - c.x) + Math.abs(ty - c.y) < 0.6;
  }

  private step(dt: number) {
    const allDone = this.jobs.length > 0 && this.claimed.size === this.jobs.length && this.cursors.every((c) => c.phase !== "work" && c.phase !== "commute");
    if (allDone && this.completedAt === null) {
      this.completedAt = this.clock;
      for (const c of this.cursors) {
        c.phase = "celebrate";
        c.leaveAt = this.clock + CELEBRATE_MS + Math.random() * 3000;
      }
      this.opts.onComplete?.();
    }
    if (this.completedAt !== null && this.settledAt === null && this.cursors.every((c) => c.phase === "home")) {
      this.settledAt = this.clock;
    }

    const commuteSpeed = this.cell * 2.6;
    const workSpeed = this.cell * 0.7;
    const commuteRun = this.cell * 0.35;
    const workRun = Math.max(2, this.cell * 0.03);

    for (const c of this.cursors) {
      const px = c.x;
      const py = c.y;
      switch (c.phase) {
        case "idle": {
          if (this.clock >= c.nextDecision) {
            const j = this.completedAt === null ? this.pickJob(c) : null;
            if (j) {
              this.claim(c, j);
              c.phase = "commute";
              break;
            }
            // Nothing to do: fidget nearby.
            c.tx = Math.min(this.w - 10, Math.max(10, c.x + (Math.random() - 0.5) * this.cell * 0.8));
            c.ty = Math.min(this.h - 10, Math.max(10, c.y + (Math.random() - 0.5) * this.cell * 0.8));
            c.nextDecision = this.clock + 400 + Math.random() * 1600;
          }
          this.walk(c, c.tx, c.ty, this.cell * 0.5, commuteRun * 0.5, dt);
          break;
        }
        case "commute": {
          const [sx, sy] = c.job!.pts[0];
          if (this.walk(c, sx, sy, commuteSpeed, commuteRun, dt)) {
            c.phase = "work";
            c.pi = 1;
          }
          this.ink(this.pctx, px, py, c.x, c.y, COMMUTE_TRAIL, 1);
          break;
        }
        case "work": {
          const j = c.job!;
          let budget = dt;
          // Follow the polyline; small time slices so a fast cursor can pass several points in one frame.
          while (budget > 0 && c.pi < j.pts.length) {
            const [tx, ty] = j.pts[c.pi];
            const slice = Math.min(budget, 1 / 120);
            if (this.walk(c, tx, ty, workSpeed, workRun, slice)) c.pi++;
            budget -= slice;
          }
          this.ink(this.tctx, px, py, c.x, c.y, j.color, j.width);
          if (c.pi >= j.pts.length) {
            const nxt = j.next !== null && !this.claimed.has(j.next) ? this.jobs[j.next] : null;
            if (nxt) {
              this.claim(c, nxt);
              c.pi = 1;
            } else {
              c.job = null;
              c.phase = "idle";
              c.nextDecision = this.clock + 150 + Math.random() * 500;
            }
          }
          break;
        }
        case "celebrate": {
          // Mill about the finished message for a bit, then clock out one by one.
          if (this.clock >= c.leaveAt) {
            c.phase = "gohome";
            break;
          }
          if (this.clock >= c.nextDecision) {
            c.tx = Math.min(this.w - 10, Math.max(10, c.x + (Math.random() - 0.5) * this.cell * 1.2));
            c.ty = Math.min(this.h - 10, Math.max(10, c.y + (Math.random() - 0.5) * this.cell * 1.2));
            c.nextDecision = this.clock + 500 + Math.random() * 1500;
          }
          this.walk(c, c.tx, c.ty, this.cell * 0.6, commuteRun, dt);
          break;
        }
        case "gohome": {
          // Off the clock: no trail on the way back to the cave.
          const { x, y, r } = this.cave;
          if (this.walk(c, x + r * 0.25, y + (Math.random() - 0.5) * 2, commuteSpeed, commuteRun, dt)) c.phase = "home";
          break;
        }
        case "home":
          break;
      }
    }
  }

  // ---- rendering ---------------------------------------------------------

  private ink(t: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, color: string, width: number) {
    if (ax === bx && ay === by) return;
    t.strokeStyle = color;
    t.lineWidth = width;
    t.lineCap = "round";
    t.lineJoin = "round";
    t.beginPath();
    t.moveTo(ax, ay);
    t.lineTo(bx, by);
    t.stroke();
  }

  private draw() {
    const g = this.ctx;
    g.fillStyle = "#0b0b0e";
    g.fillRect(0, 0, this.w, this.h);
    let pathAlpha = 1;
    if (this.settledAt !== null) {
      const u = Math.min(1, (this.clock - this.settledAt) / DIM_MS);
      pathAlpha = 1 - (1 - PATHS_DIM) * u;
    }
    g.globalAlpha = pathAlpha;
    g.drawImage(this.paths, 0, 0, this.w, this.h);
    g.globalAlpha = 1;
    g.drawImage(this.trail, 0, 0, this.w, this.h);
    this.drawCave();
    for (const c of this.cursors) if (c.phase !== "home") this.drawCursor(c);
  }

  /** A dark arch on the left wall: where the crew lives between shifts. */
  private drawCave() {
    const g = this.ctx;
    const { x, y, r } = this.cave;
    g.beginPath();
    g.arc(x, y, r, -Math.PI / 2, Math.PI / 2);
    g.closePath();
    g.fillStyle = "#1a1a20";
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.22)";
    g.lineWidth = 1.5;
    g.stroke();
    // Inner shadow so the mouth reads as a hole, not a bump.
    g.beginPath();
    g.arc(x, y, r * 0.62, -Math.PI / 2, Math.PI / 2);
    g.closePath();
    g.fillStyle = "#050507";
    g.fill();
  }

  private drawCursor(c: Cursor) {
    const g = this.ctx;
    const s = Math.max(14, Math.min(22, this.cell * 0.13)) / 18;
    g.save();
    g.translate(c.x, c.y);
    g.scale(c.flip ? -s : s, s);
    // Classic arrow pointer, tip at the origin.
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, 17);
    g.lineTo(4.2, 13.2);
    g.lineTo(7, 19.5);
    g.lineTo(9.6, 18.4);
    g.lineTo(6.8, 12.2);
    g.lineTo(12.2, 12.2);
    g.closePath();
    g.fillStyle = c.phase === "work" ? "#ffffff" : "#e6e6e6";
    g.strokeStyle = "#000";
    g.lineWidth = 1.4;
    g.lineJoin = "round";
    g.fill();
    g.stroke();
    g.restore();
  }
}

export type { Pt };
