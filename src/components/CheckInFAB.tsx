"use client";

type Props = {
  todayCheckedIn: boolean;
  onClick: () => void;
  className?: string;
};

export default function CheckInFAB({ todayCheckedIn, onClick, className }: Props) {
  return (
    <div className={className ?? "fixed bottom-6 right-6 sm:right-[calc(50%-208px)] z-20 flex flex-col items-end"}>
      <button
        onClick={onClick}
        className={`relative w-14 h-14 rounded-full shadow-lg active:scale-95 transition-all flex items-center justify-center ${
          todayCheckedIn
            ? "bg-yellow-400 hover:bg-yellow-500"
            : "bg-[#2B4B8C] hover:bg-[#1e3a70]"
        }`}
        aria-label="Check in today"
      >
        <span className="text-2xl">💰</span>
      </button>
    </div>
  );
}
