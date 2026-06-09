"use client";

import { useEffect, useState } from "react";

const ORBIT_CSS = `
@keyframes checkin-orbit {
  from { transform: rotate(0deg) translateX(32px) rotate(0deg) translate(-50%, -50%); }
  to   { transform: rotate(360deg) translateX(32px) rotate(-360deg) translate(-50%, -50%); }
}
.checkin-orbit-emoji {
  position: absolute;
  top: 50%;
  left: 50%;
  font-size: 32px;
  line-height: 1;
  animation: checkin-orbit 6s linear infinite;
  transform-origin: 0 0;
  pointer-events: none;
  user-select: none;
}
`;

type Props = {
  todayCheckedIn: boolean;
  onClick: () => void;
  className?: string;
};

export default function CheckInFAB({ todayCheckedIn, onClick, className }: Props) {
  const [orbitOffset, setOrbitOffset] = useState(0);

  useEffect(() => { setOrbitOffset(Math.random() * 6); }, []);

  return (
    <div className={className ?? "fixed bottom-6 right-6 sm:right-[calc(50%-208px)] z-20 flex flex-col items-end"}>
      <style>{ORBIT_CSS}</style>

      {/* FAB */}
      <button
        onClick={onClick}
        className={`relative w-14 h-14 rounded-full shadow-lg active:scale-95 transition-all flex items-center justify-center ${
          todayCheckedIn
            ? "bg-yellow-400 hover:bg-yellow-500"
            : "bg-[#2B4B8C] hover:bg-[#1e3a70]"
        }`}
        style={{ overflow: "visible" }}
        aria-label="Check in today"
      >
        <span className="text-2xl">💰</span>
        {/* Orbiting emojis */}
        <span className="checkin-orbit-emoji" style={{ animationDelay: `-${orbitOffset.toFixed(2)}s` }}>🐑</span>
        <span className="checkin-orbit-emoji" style={{ animationDelay: `-${((orbitOffset + 3) % 6).toFixed(2)}s` }}>🐺</span>
      </button>
    </div>
  );
}
