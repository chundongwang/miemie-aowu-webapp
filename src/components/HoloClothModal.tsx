"use client";

import { useEffect, useRef } from "react";
import { HoloApp, type HoloParams } from "@/lib/holocloth/scene";

const CLOTH_URL = "/new_background.png";
const BUMP_URL = "/bump-scratches.jpg";

// The default look from holocloth's dial (Holo preset), used as-is.
const DEFAULT_PARAMS: HoloParams = {
  performance: "High",
  physics: { viscosity: 0.6, stiffness: 1, iterations: 14, smoothing: 0.045, grabRadius: 0.27 },
  material: {
    preset: "Holo",
    finish: "Matte",
    baseColor: "#20242d",
    holoIntensity: 3.78,
    holoScale: 400,
    bandFreq: 1.1,
    saturation: 1,
    hueShift: 0.37,
    sparkle: 0.73,
    specTint: 0.33,
    iridescence: 0.81,
    roughness: 0.62,
    metalness: 1,
    clearcoat: 0.06,
    coatRoughness: 0.7,
    sheen: 0,
    bump: 3,
    bumpTiling: 3,
  },
  images: { edit: false, useImage: true, scale: 0.35, rotation: 0, opacity: 1, cornerRadius: 0 },
  render: {
    background: "#0b0c12",
    exposure: 0.5,
    environment: 0.73,
    bloom: 0.05,
    bloomThreshold: 1.41,
    noise: 0.345,
    toneMapping: "Neutral",
    occlusion: true,
    occlusionStrength: 1,
    dof: false,
    dofAperture: 40,
    dofBlur: 0.04,
    dofRange: 0.3,
  },
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${url}: decode failed`));
    img.src = url;
  });
}

export default function HoloClothModal({ onClose, closeLabel }: { onClose: () => void; closeLabel: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let app: HoloApp | null = null;
    try {
      app = new HoloApp(host); // starts its own render loop + resize observer
    } catch {
      return; // WebGL unavailable
    }

    // Establish the material/render look first (cloth stays hidden until images land).
    app.applyParams({ ...DEFAULT_PARAMS, images: { ...DEFAULT_PARAMS.images, useImage: false } });

    let cancelled = false;
    Promise.all([loadImage(CLOTH_URL), loadImage(BUMP_URL)])
      .then(([cloth, bump]) => {
        if (cancelled || !app) return;
        app.setBumpMap(bump);
        app.setClothImage(cloth);
        app.applyParams(DEFAULT_PARAMS); // useImage: true
        app.reveal();
      })
      .catch((err) => {
        console.error("[holocloth] asset load failed", err);
        if (!cancelled) app?.reveal();
      });

    return () => {
      cancelled = true;
      app?.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60]" style={{ background: "#0b0c12" }} role="dialog" aria-modal="true">
      <div ref={hostRef} className="absolute inset-0" style={{ touchAction: "none" }} />

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
