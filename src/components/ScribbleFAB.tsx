"use client";

export default function ScribbleFAB({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={className ?? "bg-[#2B4B8C] text-white w-14 h-14 rounded-full text-xl shadow-lg hover:bg-[#1e3a70] active:scale-95 transition-transform flex items-center justify-center"}
      aria-label="Scribble drawing game"
    >
      ✏️
    </button>
  );
}