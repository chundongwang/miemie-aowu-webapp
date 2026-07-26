"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const MODEL_URL = "/models/kitty.fbx";

// Kitty size & placement.
const TARGET_PX = 150; // on-screen height of the model, in CSS pixels
const CENTER_FRACTION = 0.88; // 0.5 = center, higher = lower (near bottom)

// How much scroll/drag it takes to fully pull the noodle (fraction of screen).
const DRAG_SPAN = 0.9;
const WHEEL_SPAN = 1.5;
const SPIN_TURNS = 3; // full kitty rotations over a full pull
const FILL_RINGS = 13; // nested heart rings that fill the interior

type Pt = { x: number; y: number };
type Path = { pts: Pt[]; cum: number[]; total: number };

// One long path: a wavy rise from the bottom, then the heart outline, then
// nested inward rings that pack the heart full of noodle.
function buildPath(W: number, H: number): Path {
  const cx = W / 2;
  const bottomY = CENTER_FRACTION * H; // start behind the kitty so the tail is hidden
  const heartCenterY = H * 0.24;
  const scale = Math.min((H * 0.28) / 34, (W * 0.5) / 32);
  const tipY = heartCenterY + 17 * scale; // heart's bottom point (math t=π)

  const heartPt = (t: number): Pt => {
    const xm = 16 * Math.pow(Math.sin(t), 3);
    const ym = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x: cx + scale * xm, y: heartCenterY - scale * ym };
  };

  const HEART = 220;
  const outline: Pt[] = [];
  for (let i = 0; i <= HEART; i++) outline.push(heartPt(Math.PI + (i / HEART) * Math.PI * 2));
  let sx = 0;
  let sy = 0;
  for (const p of outline) {
    sx += p.x;
    sy += p.y;
  }
  const ccx = sx / outline.length;
  const ccy = sy / outline.length;

  const pts: Pt[] = [];

  const RISE = 130;
  const amp = W * 0.05;
  for (let i = 0; i <= RISE; i++) {
    const u = i / RISE;
    pts.push({ x: cx + Math.sin(u * Math.PI * 3) * amp, y: bottomY + (tipY - bottomY) * u });
  }

  for (let ring = 0; ring <= FILL_RINGS; ring++) {
    const f = 1 - ring / (FILL_RINGS + 1);
    for (let i = 1; i <= HEART; i++) {
      const p = outline[i];
      pts.push({ x: ccx + (p.x - ccx) * f, y: ccy + (p.y - ccy) * f });
    }
  }

  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return { pts, cum, total: cum[cum.length - 1] };
}

function sampleUpTo(path: Path, targetLen: number): Pt[] {
  const { pts, cum } = path;
  if (targetLen <= 0) return [];
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] <= targetLen) {
      out.push(pts[i]);
    } else {
      const seg = cum[i] - cum[i - 1];
      const t = seg > 0 ? (targetLen - cum[i - 1]) / seg : 0;
      out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t });
      break;
    }
  }
  return out;
}

function stroke(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

// A twinkling 4-point sparkle (cross-shaped star) with a soft glow.
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, a: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = `rgba(170,200,255,${a * 0.5})`;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.55, 0, 6.2832);
  ctx.fill();
  ctx.fillStyle = `rgba(238,245,255,${a})`;
  ctx.beginPath();
  const inner = s * 0.16;
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4;
    const r = k % 2 === 0 ? s : inner;
    const px = x + Math.cos(ang) * r;
    const py = y + Math.sin(ang) * r;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export default function NoodleHeartModal({
  onClose,
  closeLabel,
  hint,
}: {
  onClose: () => void;
  closeLabel: string;
  hint: string;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const noodleRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    const noodle = noodleRef.current;
    if (!mount || !noodle) return;
    const nctx = noodle.getContext("2d");
    if (!nctx) return;

    let W = mount.clientWidth || 1;
    let H = mount.clientHeight || 1;
    let path = buildPath(W, H);

    const stars = Array.from({ length: 48 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 4 + Math.random() * 7,
      phase: Math.random() * Math.PI * 2,
      speed: 0.002 + Math.random() * 0.004,
      bright: 0.5 + Math.random() * 0.5,
    }));
    let starVis = 0;

    // ---- gesture-driven, reversible progress [0..1] ----------------------
    let progress = 0;
    let dragging = false;
    let ly = 0;
    const bump = (dyUp: number, span: number) => {
      progress = Math.max(0, Math.min(1, progress + dyUp / (H * span)));
    };
    const onDown = (e: PointerEvent) => {
      dragging = true;
      ly = e.clientY;
      noodle.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dy = e.clientY - ly;
      ly = e.clientY;
      bump(-dy, DRAG_SPAN);
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      bump(-e.deltaY, WHEEL_SPAN);
    };
    noodle.addEventListener("pointerdown", onDown);
    noodle.addEventListener("pointermove", onMove);
    noodle.addEventListener("pointerup", onUp);
    noodle.addEventListener("pointercancel", onUp);
    noodle.addEventListener("wheel", onWheel, { passive: false });

    // ---- 3D kitty (best-effort; noodle still works without WebGL) ---------
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    const modelGroup = new THREE.Group();
    let modelHeight = 0;
    let modelRadius = 1;
    let modelReady = false;

    function frameCamera() {
      if (!camera) return;
      const fov = (camera.fov * Math.PI) / 180;
      const dist = (modelHeight * H) / (2 * TARGET_PX * Math.tan(fov / 2));
      const worldPerPixel = modelHeight / TARGET_PX;
      const lookY = (CENTER_FRACTION - 0.5) * H * worldPerPixel;
      camera.position.set(0, lookY, dist);
      camera.lookAt(0, lookY, 0);
      camera.near = Math.max(0.01, dist - modelRadius * 1.5);
      camera.far = dist + modelRadius * 1.5;
      camera.updateProjectionMatrix();
    }

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      if (!renderer.getContext()) throw new Error("no webgl");
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
      mount.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 1000);
      pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      const key = new THREE.DirectionalLight(0xffffff, 2);
      key.position.set(3, 6, 5);
      scene.add(key);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.5));
      scene.add(new THREE.AmbientLight(0xffffff, 0.25));
      scene.add(modelGroup);

      new FBXLoader().load(MODEL_URL, (obj) => {
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            if (!mat) continue;
            const any = mat as unknown as { opacity?: number; transparent?: boolean };
            if (any.opacity === 0) {
              any.opacity = 1;
              any.transparent = false;
            }
          }
        });
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        obj.position.sub(center);
        modelGroup.add(obj);
        modelHeight = size.y || 1;
        modelRadius = 0.5 * size.length();
        modelReady = true;
        frameCamera();
      });
    } catch {
      renderer = null;
    }

    function resize() {
      W = mount!.clientWidth;
      H = mount!.clientHeight;
      if (!W || !H) return;
      path = buildPath(W, H);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      noodle!.width = Math.round(W * dpr);
      noodle!.height = Math.round(H * dpr);
      nctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (renderer && camera) {
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
        if (modelReady) frameCamera();
      }
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    function frame(now: number) {
      modelGroup.rotation.y = progress * SPIN_TURNS * Math.PI * 2;
      if (renderer && scene && camera) renderer.render(scene, camera);

      nctx!.clearRect(0, 0, W, H);

      const target = progress > 0.995 ? 1 : 0;
      starVis += (target - starVis) * 0.06;
      if (starVis > 0.01) {
        for (const st of stars) {
          const tw = Math.max(0, Math.sin(now * st.speed + st.phase));
          const a = starVis * st.bright * (0.12 + 0.88 * tw);
          if (a > 0.02) drawStar(nctx!, st.x * W, st.y * H, st.size, a);
        }
      }

      const vis = sampleUpTo(path, progress * path.total);
      if (vis.length > 1) {
        nctx!.lineJoin = "round";
        nctx!.lineCap = "round";
        const done = progress > 0.985;
        nctx!.save();
        if (done) {
          nctx!.shadowColor = "rgba(255,120,150,0.9)";
          nctx!.shadowBlur = 22;
        }
        nctx!.strokeStyle = "#c99a3f";
        nctx!.lineWidth = 15;
        stroke(nctx!, vis);
        nctx!.restore();
        nctx!.strokeStyle = "#f6e6ad";
        nctx!.lineWidth = 11;
        stroke(nctx!, vis);
        nctx!.strokeStyle = "rgba(255,255,255,0.4)";
        nctx!.lineWidth = 3.5;
        stroke(nctx!, vis);
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      noodle.removeEventListener("pointerdown", onDown);
      noodle.removeEventListener("pointermove", onMove);
      noodle.removeEventListener("pointerup", onUp);
      noodle.removeEventListener("pointercancel", onUp);
      noodle.removeEventListener("wheel", onWheel);
      pmrem?.dispose();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60]"
      style={{
        background:
          "radial-gradient(70% 50% at 32% 22%, rgba(96,150,255,0.30) 0%, transparent 60%), " +
          "radial-gradient(120% 100% at 50% 40%, #2350b8 0%, #14307e 32%, #0a1c50 62%, #050b26 100%)",
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Noodle underneath; kitty canvas on top (transparent) but click-through. */}
      <canvas ref={noodleRef} className="absolute inset-0 h-full w-full" style={{ touchAction: "none" }} />
      <div ref={mountRef} className="pointer-events-none absolute inset-0" />

      <button
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white/90 backdrop-blur-sm transition-colors hover:bg-white/25"
        style={{ top: "calc(env(safe-area-inset-top) + 1.25rem)" }}
      >
        ✕
      </button>

      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/40">
        {hint}
      </div>
    </div>
  );
}
