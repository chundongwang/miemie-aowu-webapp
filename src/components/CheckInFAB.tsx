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
};

export default function CheckInFAB({ todayCheckedIn, onClick }: Props) {
  const [showPopup, setShowPopup]   = useState(false);
  const [orbitOffset] = useState(() => Math.random() * 6);

  useEffect(() => {
    if (todayCheckedIn) return; // don't nag if already checked in
    const show = () => {
      setShowPopup(true);
      setTimeout(() => setShowPopup(false), 5000);
    };
    // First popup after 1s (before the other FABs), then every 20s
    const first = setTimeout(show, 1000);
    const interval = setInterval(show, 20000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [todayCheckedIn]);

  return (
    <div className="fixed bottom-6 right-6 sm:right-[calc(50%-208px)] z-20 flex flex-col items-end">
      <style>{ORBIT_CSS}</style>

      {/* Popup bubble */}
      <div
        className={`mb-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-md text-xs text-gray-700 dark:text-gray-200 whitespace-nowrap transition-all duration-300 ${
          showPopup ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
        }`}
      >
        <span className="font-medium">今天打卡了吗</span>
        <span className="text-gray-400 dark:text-gray-500 ml-1">Check in today</span>
        <div className="absolute right-4 -bottom-1.5 w-3 h-3 bg-white dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 rotate-45" />
      </div>

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
        <span className="text-2xl">🪙</span>
        {/* Orbiting emojis */}
        <span className="checkin-orbit-emoji" style={{ animationDelay: `-${orbitOffset.toFixed(2)}s` }}>🐑</span>
        <span className="checkin-orbit-emoji" style={{ animationDelay: `-${((orbitOffset + 3) % 6).toFixed(2)}s` }}>🐺</span>
      </button>
    </div>
  );
}
