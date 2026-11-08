import { HANZI_MEDIANS, type Pt } from "./hanziData";

/** One unit of work for a cursor: a short polyline it has to drag along. */
export type Job = {
  id: number;
  /** Index of the stroke this job belongs to (jobs of one stroke are drawn in order). */
  stroke: number;
  /** Global drawing order hint (stroke order within glyph, glyph order within text). */
  order: number;
  /** Id of the next job on the same stroke, so a cursor can keep dragging without a commute. */
  next: number | null;
  pts: Pt[];
  color: string;
  width: number;
};

export type Layout = {
  jobs: Job[];
  /** Glyph cell size in px, handy for scaling speeds and line widths. */
  cell: number;
};

const TEXT_ROWS_PORTRAIT = ["❤", "冬天快乐", "🐑"];
const TEXT_ROWS_LANDSCAPE = ["❤冬天快乐🐑"];

const HEART_COLOR = "#ff4d6d";
const SHEEP_COLOR = "#f7e6b5";
const INK_COLOR = "#f4f4f0";

/** Parametric heart in unit-box coords (y down). Left half then right half, both from the top notch to the tip. */
function heartStrokes(): Pt[][] {
  const N = 90;
  const s = 0.78 / 34; // heart spans x ∈ [-16, 16], y ∈ [-17, 13]
  const sample = (t: number): Pt => {
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [0.5 + x * s, 0.5 - (y + 2) * s];
  };
  const right: Pt[] = [];
  const left: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI;
    right.push(sample(t)); // t: 0 → π, notch → tip via the right lobe
    left.push(sample(2 * Math.PI - t)); // notch → tip via the left lobe
  }
  return [left, right];
}

/** A little sheep facing right, in unit-box coords (y down): fluffy body, head, ears, eye, legs, tail. */
function sheepStrokes(): Pt[][] {
  const body: Pt[] = [];
  const N = 140;
  const cx = 0.46, cy = 0.5, rx = 0.3, ry = 0.21, bumps = 11, amp = 0.028;
  for (let i = 0; i <= N; i++) {
    const th = -Math.PI / 2 + (i / N) * Math.PI * 2; // start at the top, go clockwise
    const w = 1 + (amp / ry) * Math.cos(bumps * th);
    body.push([cx + rx * w * Math.cos(th), cy + ry * w * Math.sin(th)]);
  }
  const head: Pt[] = [];
  const hx = 0.8, hy = 0.42, hrx = 0.09, hry = 0.1;
  for (let i = 0; i <= 48; i++) {
    const th = -Math.PI / 2 + (i / 48) * Math.PI * 2;
    head.push([hx + hrx * Math.cos(th), hy + hry * Math.sin(th)]);
  }
  const leg = (x: number): Pt[] => [[x, 0.69], [x, 0.87]];
  return [
    body,
    head,
    [[0.745, 0.355], [0.7, 0.29], [0.725, 0.37]], // left ear
    [[0.855, 0.355], [0.9, 0.29], [0.875, 0.37]], // right ear
    [[0.83, 0.41], [0.845, 0.415]], // eye
    leg(0.32), leg(0.42), leg(0.55), leg(0.65),
    [[0.17, 0.5], [0.12, 0.44], [0.14, 0.39]], // tail
  ];
}

const PICTOGRAMS: Record<string, { strokes: () => Pt[][]; color: string; widthMul: number }> = {
  "❤": { strokes: heartStrokes, color: HEART_COLOR, widthMul: 1.15 },
  "🐑": { strokes: sheepStrokes, color: SHEEP_COLOR, widthMul: 0.9 },
};

function resample(pts: Pt[], spacing: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    let d = spacing - carry;
    while (d <= len) {
      const u = d / len;
      out.push([ax + (bx - ax) * u, ay + (by - ay) * u]);
      d += spacing;
    }
    carry = len - (d - spacing);
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > spacing * 0.3) out.push(last);
  return out;
}

function polylineLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

/** Split one stroke into chained jobs no longer than maxLen, so several cursors can share a long stroke. */
function chunkStroke(
  pts: Pt[],
  stroke: number,
  orderBase: number,
  maxLen: number,
  color: string,
  width: number,
  jobs: Job[],
) {
  const total = polylineLength(pts);
  const n = Math.max(1, Math.ceil(total / maxLen));
  const per = Math.ceil((pts.length - 1) / n);
  const firstId = jobs.length;
  for (let k = 0; k < n; k++) {
    const a = k * per;
    const b = Math.min(pts.length - 1, a + per);
    if (a >= b) break;
    const id = jobs.length;
    jobs.push({ id, stroke, order: orderBase + k, next: null, pts: pts.slice(a, b + 1), color, width });
    if (id > firstId) jobs[id - 1].next = id;
  }
}

/** Lay the message out for a w×h canvas and cut it into cursor jobs. */
export function layoutJobs(w: number, h: number): Layout {
  const rows = h > w * 1.05 ? TEXT_ROWS_PORTRAIT : TEXT_ROWS_LANDSCAPE;
  const longest = Math.max(...rows.map((r) => [...r].length));
  const gap = 0.12; // fraction of a cell between glyphs
  const rowGap = 0.25;
  const cell = Math.min((w * 0.9) / (longest + (longest - 1) * gap), (h * 0.8) / (rows.length + (rows.length - 1) * rowGap), 260);

  const totalH = rows.length * cell + (rows.length - 1) * rowGap * cell;
  const top = (h - totalH) / 2;

  const jobs: Job[] = [];
  const spacing = Math.max(3, cell * 0.035);
  const maxLen = cell * 0.32;
  const inkWidth = Math.max(2.5, cell * 0.03);

  let stroke = 0;
  let order = 0;
  rows.forEach((row, r) => {
    const glyphs = [...row];
    const rowW = glyphs.length * cell + (glyphs.length - 1) * gap * cell;
    const left = (w - rowW) / 2;
    const y0 = top + r * (cell + rowGap * cell);
    glyphs.forEach((g, i) => {
      const x0 = left + i * (cell + gap * cell);
      const pict = PICTOGRAMS[g];
      if (pict) {
        // A pictogram alone on its row (portrait) gets a bigger box so it holds its own against the text.
        const k = glyphs.length === 1 ? 1.4 : 1;
        const px0 = x0 - (cell * (k - 1)) / 2;
        const py0 = y0 - (cell * (k - 1)) / 2;
        for (const st of pict.strokes()) {
          const pts: Pt[] = st.map(([x, y]) => [px0 + x * cell * k, py0 + y * cell * k]);
          chunkStroke(resample(pts, spacing), stroke++, order, maxLen, pict.color, inkWidth * pict.widthMul, jobs);
          order += 10;
        }
        return;
      }
      const medians = HANZI_MEDIANS[g];
      if (!medians) return;
      for (const m of medians) {
        const pts: Pt[] = m.map(([x, y]) => [x0 + (x / 1024) * cell, y0 + ((900 - y) / 1024) * cell]);
        chunkStroke(resample(pts, spacing), stroke++, order, maxLen, INK_COLOR, inkWidth, jobs);
        order += 10;
      }
    });
  });

  return { jobs, cell };
}
