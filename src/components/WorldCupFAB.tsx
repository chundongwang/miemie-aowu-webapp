"use client";

import { useEffect, useState } from "react";

// Sheep + wolf orbit the ⚽ button. Same trick as the old CheckInFAB orbit:
// a CSS keyframe rotates each emoji around the button center, with the inner
// "rotate(-360deg)" cancelling the spin so the emoji always stays upright.
const ORBIT_CSS = `
@keyframes wc-orbit {
  from { transform: rotate(0deg) translateX(32px) rotate(0deg) translate(-50%, -50%); }
  to   { transform: rotate(360deg) translateX(32px) rotate(-360deg) translate(-50%, -50%); }
}
.wc-orbit-emoji {
  position: absolute;
  top: 50%;
  left: 50%;
  font-size: 32px;
  line-height: 1;
  animation: wc-orbit 6s linear infinite;
  transform-origin: 0 0;
  pointer-events: none;
  user-select: none;
}
`;

export default function WorldCupFAB({ onClick }: { onClick: () => void }) {
  // Randomize the starting orbit angle on mount so refresh-after-refresh
  // doesn't always show the sheep at the same clock position.
  const [orbitOffset, setOrbitOffset] = useState(0);
  useEffect(() => { setOrbitOffset(Math.random() * 6); }, []);

  return (
    <div className="fixed bottom-[19.5rem] right-6 sm:right-[calc(50%-208px)] z-20 flex flex-col items-end">
      <style>{ORBIT_CSS}</style>

      <button
        onClick={onClick}
        className="relative w-14 h-14 rounded-full bg-[#2B4B8C] shadow-lg hover:bg-[#1e3a70] active:scale-95 transition-transform flex items-center justify-center"
        style={{ overflow: "visible" }}
        aria-label="2026 World Cup schedule"
      >
        <span className="text-2xl">⚽</span>
        {/* Orbiting emojis — sheep and wolf, half an orbit apart. */}
        <span className="wc-orbit-emoji" style={{ animationDelay: `-${orbitOffset.toFixed(2)}s` }}>🐑</span>
        <span className="wc-orbit-emoji" style={{ animationDelay: `-${((orbitOffset + 3) % 6).toFixed(2)}s` }}>🐺</span>
      </button>
    </div>
  );
}
