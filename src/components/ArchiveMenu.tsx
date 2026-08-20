"use client";

import { useState } from "react";
import { useLocale } from "@/context/LocaleContext";

import DailyChallengeFAB from "@/components/DailyChallengeFAB";
import FoodWheelFAB from "@/components/FoodWheelFAB";
import CheckInFAB from "@/components/CheckInFAB";
import FireworkLetter from "@/components/FireworkLetter";
import NoodleHeartFAB from "@/components/NoodleHeartFAB";
import HoloClothFAB from "@/components/HoloClothFAB";
import VideoFAB from "@/components/VideoFAB";

const COPY = {
  en: {
    menu: "More",
    title: "More",
    video: "Video",
    holo: "Holo cloth",
    noodle: "Noodle heart",
    firework: "Firework",
    wheel: "Food wheel",
    challenge: "Challenge",
    checkin: "Check-in",
  },
  zh: {
    menu: "更多",
    title: "更多",
    video: "视频",
    holo: "全息布",
    noodle: "面条爱心",
    firework: "烟花",
    wheel: "美食转盘",
    challenge: "挑战",
    checkin: "打卡",
  },
} as const;

type Props = {
  checkInTodayChecked: boolean;
  onCheckIn: () => void;
};

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {children}
      <span className="text-[11px] text-gray-500 dark:text-gray-400 text-center leading-tight">{label}</span>
    </div>
  );
}

export default function ArchiveMenu({ checkInTodayChecked, onCheckIn }: Props) {
  const locale = useLocale();
  const t = COPY[locale] ?? COPY.en;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t.menu}
        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 text-xl leading-none px-1"
      >
        ⋯
      </button>

      {open && (
        <>
          {/* Backdrop — only reachable when no archived modal is covering it */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="fixed right-3 top-[calc(3.25rem+env(safe-area-inset-top))] z-40 w-64 rounded-2xl bg-white dark:bg-gray-800 shadow-xl border border-gray-100 dark:border-gray-700 p-4"
            role="menu"
          >
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-3 px-1">{t.title}</p>
            <div className="grid grid-cols-3 gap-x-2 gap-y-4">
              <Cell label={t.video}><VideoFAB /></Cell>
              <Cell label={t.holo}><HoloClothFAB /></Cell>
              <Cell label={t.noodle}><NoodleHeartFAB /></Cell>
              <Cell label={t.firework}><FireworkLetter /></Cell>
              <Cell label={t.wheel}><FoodWheelFAB /></Cell>
              <Cell label={t.challenge}><DailyChallengeFAB loggedIn={true} /></Cell>
              <Cell label={t.checkin}>
                <CheckInFAB todayCheckedIn={checkInTodayChecked} onClick={onCheckIn} />
              </Cell>
            </div>
          </div>
        </>
      )}
    </>
  );
}
