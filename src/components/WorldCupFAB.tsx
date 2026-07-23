"use client";

export default function WorldCupFAB({ onClick }: { onClick: () => void }) {
  return (
    <div className="fixed bottom-[19.5rem] right-6 sm:right-[calc(50%-208px)] z-20 flex flex-col items-end">
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
