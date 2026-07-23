"use client";

type Props = {
  todayCheckedIn: boolean;
  onClick: () => void;
};

export default function CheckInFAB({ todayCheckedIn, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`w-14 h-14 rounded-full shadow-lg active:scale-95 transition-all flex items-center justify-center ${
        todayCheckedIn
          ? "bg-yellow-400 hover:bg-yellow-500"
          : "bg-[#2B4B8C] hover:bg-[#1e3a70]"
      }`}
      aria-label="Check in today"
    >
      <span className="text-2xl">💰</span>
    </button>
  );
}
