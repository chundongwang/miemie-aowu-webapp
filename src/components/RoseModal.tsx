"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

export default function RoseModal({ onClose, closeLabel }: { onClose: () => void; closeLabel: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Fall back gracefully where WebGL isn't available.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      if (!renderer.getContext()) throw new Error("no webgl");
    } catch {
      setFailed(true);
      setLoading(false);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none"; // let OrbitControls own gestures
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    camera.position.set(0, 0, 7);

    // Soft studio lighting via a generated environment + a key light.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 5, 4);
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xc9d8ff, 0x20243a, 0.45));
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));

    const rose = new THREE.Group();
    scene.add(rose);

    // Interaction: drag to spin, pinch / scroll to zoom, no panning.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.autoRotate = !reduced;
    controls.autoRotateSpeed = 1.1;
    controls.enabled = false; // released after the intro dolly

    const target = new THREE.Vector3(0, 0, 0);
    let nearDist = 3.4;
    let farDist = 8;
    let modelReady = false;

    // Subtle particle shimmer floating around the rose.
    const PC = reduced ? 0 : 90;
    const pPos = new Float32Array(PC * 3);
    const pBase = new Float32Array(PC);
    for (let i = 0; i < PC; i++) {
      const r = 1.4 + Math.random() * 2.4;
      const a = Math.random() * Math.PI * 2;
      pPos[i * 3] = Math.cos(a) * r;
      pPos[i * 3 + 1] = -1.5 + Math.random() * 3.2;
      pPos[i * 3 + 2] = Math.sin(a) * r;
      pBase[i] = pPos[i * 3];
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.05,
      color: 0xdbe8ff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pGeo, pMat);
    if (PC > 0) scene.add(points);

    // Load the model.
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.load(
      "/models/rose.glb",
      (gltf) => {
        const obj = gltf.scene;
        // Center at origin and normalize to a consistent size.
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2.4 / maxDim;
        obj.scale.setScalar(scale);
        obj.position.sub(center.multiplyScalar(scale));
        rose.add(obj);

        const sphere = new THREE.Box3().setFromObject(rose).getBoundingSphere(new THREE.Sphere());
        target.copy(sphere.center);
        const fov = (camera.fov * Math.PI) / 180;
        nearDist = (sphere.radius / Math.sin(fov / 2)) * 1.08;
        farDist = nearDist * 2.4;
        controls.target.copy(target);
        controls.minDistance = nearDist * 0.55;
        controls.maxDistance = nearDist * 2.6;

        modelReady = true;
        setLoading(false);
      },
      undefined,
      (err) => {
        console.error("rose.glb failed to load", err);
        setFailed(true);
        setLoading(false);
      }
    );

    function resize() {
      const w = mount!.clientWidth;
      const h = mount!.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const start = performance.now();
    const introMs = reduced ? 0 : 1800;
    const elevation = 0.42; // camera height angle
    let raf = 0;

    function frame(now: number) {
      const t = now - start;

      if (modelReady) {
        if (t < introMs) {
          // Opening dolly: sweep in from far to near while easing.
          const k = easeOutCubic(t / introMs);
          const dist = farDist + (nearDist - farDist) * k;
          const az = 0.55 + t / 11000;
          camera.position.set(
            target.x + dist * Math.cos(elevation) * Math.sin(az),
            target.y + dist * Math.sin(elevation),
            target.z + dist * Math.cos(elevation) * Math.cos(az)
          );
          camera.lookAt(target);
        } else {
          controls.enabled = true;
          controls.update();
        }
      }

      if (PC > 0) {
        const arr = pGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < PC; i++) {
          arr[i * 3 + 1] += 0.0018;
          if (arr[i * 3 + 1] > 1.8) arr[i * 3 + 1] = -1.6;
          arr[i * 3] = pBase[i] + Math.sin(now / 1800 + i) * 0.05;
        }
        pGeo.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      draco.dispose();
      pmrem.dispose();
      pGeo.dispose();
      pMat.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (mat) {
          const mats = Array.isArray(mat) ? mat : [mat];
          for (const m of mats) {
            for (const v of Object.values(m as unknown as Record<string, unknown>)) {
              if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
            }
            m.dispose();
          }
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60]"
      style={{ background: "radial-gradient(circle at 50% 45%, #16264a 0%, #05060e 78%)" }}
      role="dialog"
      aria-modal="true"
    >
      <div ref={mountRef} className="absolute inset-0" />

      {loading && !failed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white/90 animate-spin" />
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center text-7xl">🌹</div>
      )}

      <button
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-5 w-10 h-10 rounded-full bg-white/12 hover:bg-white/25 text-white/90 flex items-center justify-center backdrop-blur-sm transition-colors z-10"
        style={{ top: "calc(env(safe-area-inset-top) + 1.25rem)" }}
      >
        ✕
      </button>

      <p
        className="absolute left-0 right-0 text-center text-[11px] text-white/35 z-10 select-none"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        花模型来自 3d66.com
      </p>
    </div>
  );
}
