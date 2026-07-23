"use client";

import { useRouter } from "next/navigation";

export default function DailyChallengeFAB({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();

  return (
    <div className="fixed bottom-[10.5rem] right-6 sm:right-[calc(50%-208px)] z-20 flex flex-col items-end">
      <button
        onClick={() => router.push(loggedIn ? "/challenge" : "/register")}
        className="relative w-14 h-14 rounded-full bg-[#2B4B8C] shadow-lg hover:bg-[#1e3a70] active:scale-95 transition-transform flex items-center justify-center"
        aria-label="IELTS Daily Challenge"
      >
        <span className="text-2xl">🧠</span>
      </button>
    </div>
  );
}
