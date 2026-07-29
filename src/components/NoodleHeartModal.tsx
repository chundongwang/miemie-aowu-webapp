"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";

// Wolf gentleman at the bottom; sheep pops into the finished heart.
const BOTTOM_URL = "/models/wolf.obj"; // colored by its .mtl materials — no texture
const HEART_URL = "/models/sheep.glb";
const HEART_COLOR = 0xffffff; // paint the sheep solid white

// Bottom model size & placement.
const TARGET_PX = 150;
const CENTER_FRACTION = 0.88;
// Wolf OBJ is authored Z-up; stand it upright. Tweak [1] (Y) to change facing.
const BOTTOM_ROT: [number, number, number] = [-Math.PI / 2, 0, 0];

// Heart-center model size & placement.
const HEART_MODEL_PX = 150;
const HEART_CENTER_FRACTION = 0.26;

const DRAG_SPAN = 0.9;
const WHEEL_SPAN = 1.5;
const SPIN_TURNS = 3;
const FILL_RINGS = 20;

type Pt = { x: number; y: number };
type Path = { pts: Pt[]; cum: number[]; total: number };

function buildPath(W: number, H: number): Path {
  const cx = W / 2;
  const bottomY = CENTER_FRACTION * H;
  const heartCenterY = H * 0.24;
  const scale = Math.min((H * 0.46) / 34, (W * 0.8) / 32);
  const tipY = heartCenterY + 17 * scale;

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
    ctx[k === 0 ? "moveTo" : "lineTo"](x + Math.cos(ang) * r, y + Math.sin(ang) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const c1 = 1.70158;
const c3 = c1 + 1;
const easeOutBack = (x: number) => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);

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

    // ---- 3D (best-effort; noodle still works without WebGL) ---------------
    let renderer: THREE.WebGLRenderer | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;

    const groupBottom = new THREE.Group();
    const groupHeart = new THREE.Group();
    const sceneBottom = new THREE.Scene();
    const sceneHeart = new THREE.Scene();
    const camBottom = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    const camHeart = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);

    const bottom = { height: 0, radius: 1, ready: false };
    const heart = { height: 0, radius: 1, ready: false };
    let heartReveal = 0;

    function addLights(scene: THREE.Scene, env: THREE.Texture) {
      scene.environment = env;
      const key = new THREE.DirectionalLight(0xffffff, 2);
      key.position.set(3, 6, 5);
      scene.add(key);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.5));
      scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    }

    function frameCam(cam: THREE.PerspectiveCamera, modelH: number, modelR: number, px: number, frac: number) {
      const fov = (cam.fov * Math.PI) / 180;
      const dist = (modelH * H) / (2 * px * Math.tan(fov / 2));
      const worldPerPixel = modelH / px;
      const lookY = (frac - 0.5) * H * worldPerPixel;
      cam.position.set(0, lookY, dist);
      cam.lookAt(0, lookY, 0);
      cam.near = Math.max(0.01, dist - modelR * 1.5);
      cam.far = dist + modelR * 1.5;
      cam.updateProjectionMatrix();
    }

    function loadInto(
      url: string,
      group: THREE.Group,
      info: { height: number; radius: number; ready: boolean },
      stripBackdrop: boolean,
      preRotate: [number, number, number] | null,
      solidColor: number | null,
      onReady: () => void
    ) {
      const onLoad = (obj: THREE.Object3D) => {
        if (solidColor !== null) {
          obj.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of mats) {
              const std = mat as THREE.MeshStandardMaterial;
              std.map = null;
              std.color?.setHex(solidColor);
              std.needsUpdate = true;
            }
          });
        }
        if (preRotate) obj.rotation.set(preRotate[0], preRotate[1], preRotate[2]);
        obj.updateMatrixWorld(true);

        // Some models ship a huge studio backdrop plane; drop it (it also
        // inflates the bounding box and shrinks the real subject on screen).
        if (stripBackdrop) {
          const meshes: THREE.Mesh[] = [];
          obj.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) meshes.push(m);
          });
          if (meshes.length > 1) {
            const dim = (m: THREE.Mesh) => {
              const s = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
              return Math.max(s.x, s.y, s.z);
            };
            const sizes = meshes.map((m) => dim(m)).sort((a, b) => a - b);
            const smallest = sizes[0] || 1;
            for (const m of meshes) if (dim(m) > smallest * 5) m.removeFromParent();
          }
        }

        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        obj.position.sub(center);
        group.add(obj);
        info.height = size.y || 1;
        info.radius = 0.5 * size.length();
        info.ready = true;
        onReady();
      };

      if (url.toLowerCase().endsWith(".obj")) {
        const dir = url.slice(0, url.lastIndexOf("/") + 1);
        const mtlName = url.slice(url.lastIndexOf("/") + 1).replace(/\.obj$/i, ".mtl");
        new MTLLoader().setPath(dir).load(mtlName, (materials) => {
          materials.preload();
          new OBJLoader().setMaterials(materials).load(url, onLoad);
        });
      } else {
        new GLTFLoader().load(url, (gltf) => onLoad(gltf.scene));
      }
    }

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      if (!renderer.getContext()) throw new Error("no webgl");
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.autoClear = false;
      renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
      mount.appendChild(renderer.domElement);

      pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      addLights(sceneBottom, env);
      addLights(sceneHeart, env);
      sceneBottom.add(groupBottom);
      sceneHeart.add(groupHeart);

      loadInto(BOTTOM_URL, groupBottom, bottom, false, BOTTOM_ROT, null, () =>
        frameCam(camBottom, bottom.height, bottom.radius, TARGET_PX, CENTER_FRACTION)
      );
      loadInto(HEART_URL, groupHeart, heart, true, null, HEART_COLOR, () =>
        frameCam(camHeart, heart.height, heart.radius, HEART_MODEL_PX, HEART_CENTER_FRACTION)
      );
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
      if (renderer) {
        renderer.setSize(W, H, false);
        camBottom.aspect = W / H;
        camHeart.aspect = W / H;
        if (bottom.ready) frameCam(camBottom, bottom.height, bottom.radius, TARGET_PX, CENTER_FRACTION);
        if (heart.ready) frameCam(camHeart, heart.height, heart.radius, HEART_MODEL_PX, HEART_CENTER_FRACTION);
      }
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    function frame(now: number) {
      groupBottom.rotation.y = progress * SPIN_TURNS * Math.PI * 2;

      // Heart-center model pops in once the heart is filled.
      const revealTarget = progress > 0.99 ? 1 : 0;
      heartReveal += (revealTarget - heartReveal) * 0.08;
      groupHeart.rotation.y += 0.008;
      groupHeart.scale.setScalar(Math.max(0, easeOutBack(Math.min(1, heartReveal))));

      if (renderer) {
        renderer.clear();
        if (bottom.ready) renderer.render(sceneBottom, camBottom);
        if (heart.ready && heartReveal > 0.01) {
          renderer.clearDepth();
          renderer.render(sceneHeart, camHeart);
        }
      }

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

        // Soft rose neon halo (subtle; a touch stronger once the heart is full).
        nctx!.save();
        nctx!.shadowColor = done ? "rgba(255,60,120,0.85)" : "rgba(228,40,96,0.6)";
        nctx!.shadowBlur = done ? 14 : 9;
        nctx!.strokeStyle = "#8b1f3d";
        nctx!.lineWidth = 8.5;
        stroke(nctx!, vis);
        nctx!.restore();

        // Glassy dark-red tube: dark rim → body → brighter translucent core → sheen.
        nctx!.strokeStyle = "#3d0c1e";
        nctx!.lineWidth = 10;
        stroke(nctx!, vis);
        nctx!.strokeStyle = "#8b1f3d";
        nctx!.lineWidth = 8;
        stroke(nctx!, vis);
        nctx!.strokeStyle = "#c2385f";
        nctx!.lineWidth = 4.2;
        stroke(nctx!, vis);
        nctx!.strokeStyle = "rgba(255,220,232,0.55)";
        nctx!.lineWidth = 1.6;
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
      {/* Noodle underneath; models canvas on top (transparent) but click-through. */}
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
