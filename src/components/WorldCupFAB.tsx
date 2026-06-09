"use client";

import { useEffect, useState } from "react";

export default function WorldCupFAB({ onClick }: { onClick: () => void }) {
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    const show = () => {
      setShowPopup(true);
      setTimeout(() => setShowPopup(false), 5000);
    };
    // Offset from the other FAB popups (FoodWheel at 4s, IELTS at 2s) so they
    // don't all bloom at once.
    const first = setTimeout(show, 6000);
    const interval = setInterval(show, 22000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, []);

  return (
    <div className="fixed bottom-[19.5rem] right-6 sm:right-[calc(50%-208px)] z-20 flex flex-col items-end">
      {/* Popup bubble */}
      <div
        className={`mb-3 relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-md text-xs text-gray-700 dark:text-gray-200 whitespace-nowrap transition-all duration-300 ${
          showPopup ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
        }`}
      >
        <span className="font-medium">世界杯赛程</span>
        <span className="text-gray-400 dark:text-gray-500 ml-1">World Cup 2026</span>
        <div className="absolute right-4 -bottom-1.5 w-3 h-3 bg-white dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 rotate-45" />
      </div>

      <button
        onClick={onClick}
        className="relative w-14 h-14 rounded-full bg-[#2B4B8C] shadow-lg hover:bg-[#1e3a70] active:scale-95 transition-transform flex items-center justify-center"
        aria-label="2026 World Cup schedule"
      >
        <span className="text-2xl">⚽</span>
      </button>
    </div>
  );
}
