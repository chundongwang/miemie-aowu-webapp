"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ORBIT_CSS = `
@keyframes challenge-orbit {
  from { transform: rotate(0deg) translateX(32px) rotate(0deg) translate(-50%, -50%); }
  to   { transform: rotate(360deg) translateX(32px) rotate(-360deg) translate(-50%, -50%); }
}
.challenge-orbit-emoji {
  position: absolute;
  top: 50%;
  left: 50%;
  font-size: 32px;
  line-height: 1;
  animation: challenge-orbit 6s linear infinite;
  transform-origin: 0 0;
  pointer-events: none;
  user-select: none;
}
`;

export default function DailyChallengeFAB({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();
  const [showPopup, setShowPopup] = useState(false);
  const [orbitOffset] = useState(() => Math.random() * 6);

  useEffect(() => {
    const show = () => {
      setShowPopup(true);
      setTimeout(() => setShowPopup(false), 5000);
    };
    // First popup after 2s, then every 14s
    const first = setTimeout(show, 2000);
    const interval = setInterval(show, 14000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 sm:right-[calc(50%-208px)] z-20 flex flex-col items-end">
      <style>{ORBIT_CSS}</style>

      {/* Popup bubble */}
      <div
        className={`mb-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-md text-xs text-gray-700 dark:text-gray-200 whitespace-nowrap transition-all duration-300 ${
          showPopup ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
        }`}
      >
        <span className="font-medium">IELTS Daily Challenge</span>
        <span className="text-gray-400 dark:text-gray-500 ml-1">雅思每日挑战</span>
        {/* Arrow pointing down */}
        <div className="absolute right-4 -bottom-1.5 w-3 h-3 bg-white dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 rotate-45" />
      </div>

      {/* FAB */}
      <button
        onClick={() => router.push(loggedIn ? "/challenge" : "/register")}
        className="relative w-14 h-14 rounded-full bg-[#2B4B8C] shadow-lg hover:bg-[#1e3a70] active:scale-95 transition-transform flex items-center justify-center"
        style={{ overflow: "visible" }}
        aria-label="IELTS Daily Challenge"
      >
        <span className="text-2xl">🧠</span>
        {/* Orbiting emojis */}
        <span className="challenge-orbit-emoji" style={{ animationDelay: `-${orbitOffset.toFixed(2)}s` }}>🐑</span>
        <span className="challenge-orbit-emoji" style={{ animationDelay: `-${((orbitOffset + 3) % 6).toFixed(2)}s` }}>🐺</span>
      </button>
    </div>
  );
}
