"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { List } from "@/types";
import NewListModal from "@/components/NewListModal";
import PullIndicator from "@/components/PullIndicator";
import DailyChallengeFAB from "@/components/DailyChallengeFAB";
import FoodWheelFAB from "@/components/FoodWheelFAB";
import CheckInFAB from "@/components/CheckInFAB";
import CheckInModal from "@/components/CheckInModal";
import ScribbleModal from "@/components/ScribbleModal";
import ScribbleFAB from "@/components/ScribbleFAB";
import ScribbleInboxModal, { type InboxScribble } from "@/components/ScribbleInboxModal";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { useT } from "@/context/LocaleContext";

type CheckInData = {
  totalDays: number;
  todayCheckedIn: boolean;
  todayEmoji: string | null;
};

export default function ListsPage() {
  const t = useT();
  const router = useRouter();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showScribble, setShowScribble] = useState(false);
  const [me, setMe] = useState<{ id: string } | null>(null);

  const [checkIn, setCheckIn]         = useState<CheckInData | null>(null);
  const [showCheckIn, setShowCheckIn] = useState(false);

  const [scribbleInbox, setScribbleInbox] = useState<InboxScribble[]>([]);
  const [showScribbleInbox, setShowScribbleInbox] = useState(false);

  async function fetchLists() {
    const [ls, user] = await Promise.all([
      fetch("/api/lists").then((r) => r.json()) as Promise<List[]>,
      fetch("/api/auth/me").then((r) => r.json()) as Promise<{ id: string }>,
    ]);
    // Suppress hasUnread for lists viewed this session (D1 replica lag workaround)
    const viewed = new Set(JSON.parse(sessionStorage.getItem("viewedLists") ?? "[]") as string[]);
    setLists(ls.map((l) => viewed.has(l.id) ? { ...l, hasUnread: false } : l));
    setMe(user);
    setLoading(false);
  }

  async function fetchCheckIn() {
    const res = await fetch("/api/checkins");
    if (res.ok) {
      const data = await res.json() as CheckInData;
      setCheckIn(data);
    }
  }

  async function fetchScribbleInbox() {
    const res = await fetch("/api/scribble/inbox");
    if (res.ok) {
      const data = (await res.json()) as InboxScribble[];
      setScribbleInbox(data);
    }
  }

  useEffect(() => {
    fetchLists();
    fetchCheckIn();
    fetchScribbleInbox();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update app-icon badge + document title whenever unread count changes
  useEffect(() => {
    const unread = lists.filter((l) => l.hasUnread).length;
    const appName = "咩咩~嗷呜";
    document.title = unread > 0 ? `(${unread}) ${appName}` : appName;

    const isNative =
      typeof window !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).Capacitor?.isNativePlatform?.();

    if (isNative) {
      // Native iOS: use Capacitor Badge plugin
      void (async () => {
        try {
          const { Badge } = await import("@capawesome/capacitor-badge");
          const { display } = await Badge.checkPermissions();
          if (display !== "granted") {
            const { display: granted } = await Badge.requestPermissions();
            if (granted !== "granted") return;
          }
          if (unread > 0) {
            await Badge.set({ count: unread });
          } else {
            await Badge.clear();
          }
        } catch { /* badge not supported on this platform */ }
      })();
    } else if ("setAppBadge" in navigator) {
      // Web PWA: use Badging API
      if (unread > 0) {
        (navigator as Navigator & { setAppBadge(n: number): Promise<void> })
          .setAppBadge(unread).catch(() => {});
      } else {
        (navigator as Navigator & { clearAppBadge(): Promise<void> })
          .clearAppBadge().catch(() => {});
      }
    }
  }, [lists]);

  const { indicatorRef, isRefreshing } = usePullToRefresh(fetchLists);
  const swipeProgress = useSwipeBack("/", !showNew && !showCheckIn && !showScribble && !showScribbleInbox);

  const unreadScribbles = scribbleInbox.filter((s) => s.guessGrade === null).length;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">

      {swipeProgress > 0 && (
        <div
          className="fixed left-0 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
          style={{ opacity: swipeProgress }}
        >
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-r-2xl px-2.5 py-3 text-gray-500 dark:text-gray-300 text-2xl leading-none">
            ‹
          </div>
        </div>
      )}

      <header className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between z-10">
        <h1 className="text-lg font-semibold">{t("myLists")}</h1>
        <div className="flex items-center gap-2">
          {/* Check-in day badge */}
          {checkIn !== null && (
            <button
              onClick={() => setShowCheckIn(true)}
              className={`flex items-center gap-1 text-xs px-2.5 py-[7px] rounded-full border transition-colors ${
                checkIn.todayCheckedIn
                  ? "border-yellow-300 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
                  : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-yellow-300 hover:text-yellow-600"
              }`}
              title="金币 · Coins earned"
            >
              <span>💰</span>
              <span className="font-medium">{checkIn.totalDays}</span>
              {checkIn.todayCheckedIn && checkIn.todayEmoji && (
                <span>{checkIn.todayEmoji}</span>
              )}
            </button>
          )}
          <button
            onClick={() => setShowNew(true)}
            className="bg-[#2B4B8C] text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            {t("newListButton")}
          </button>
          <Link href="/profile" className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400">
            {t("profile")}
          </Link>
          <button onClick={logout} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400">
            {t("signOut")}
          </button>
        </div>
      </header>

      <PullIndicator ref={indicatorRef} isRefreshing={isRefreshing} />

      <main className="max-w-lg mx-auto px-4 py-4">
        {loading ? (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500 text-sm">{t("loading")}</div>
        ) : lists.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">{t("noListsYet")}</p>
            <button
              onClick={() => setShowNew(true)}
              className="bg-[#2B4B8C] text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {t("createFirstList")}
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {lists.map((list) => {
              const isOwner = me && list.ownerId === me.id;
              const other = isOwner ? list.recipientDisplayName : list.ownerDisplayName;
              const otherLabel = isOwner ? t("sharedWith") : t("fromUser");
              const count = list.itemCount;
              const countLabel = count === 1 ? t("itemSingular") : t("itemPlural");

              return (
                <li key={list.id}>
                  <Link
                    href={`/lists/${list.id}`}
                    onClick={() => {
                      const viewed = new Set(JSON.parse(sessionStorage.getItem("viewedLists") ?? "[]") as string[]);
                      viewed.add(list.id);
                      sessionStorage.setItem("viewedLists", JSON.stringify([...viewed]));
                      setLists((prev) => prev.map((l) => l.id === list.id ? { ...l, hasUnread: false } : l));
                    }}
                    className="block bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm dark:shadow-none hover:shadow-md dark:hover:shadow-none transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{list.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{list.title}</p>
                          {list.hasUnread && (
                            <span className="shrink-0 w-2 h-2 rounded-full bg-[#2B4B8C] dark:bg-blue-400" />
                          )}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {other
                            ? `${otherLabel} ${other}`
                            : isOwner
                            ? t("notSharedYet")
                            : ""}
                          {" · "}
                          {count} {countLabel}
                        </p>
                      </div>
                      <span className="text-gray-300 dark:text-gray-600 text-lg">›</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <FoodWheelFAB />
      <DailyChallengeFAB loggedIn={true} />
      <CheckInFAB
        todayCheckedIn={checkIn?.todayCheckedIn ?? false}
        onClick={() => setShowCheckIn(true)}
        className="fixed bottom-24 right-6 sm:right-[calc(50%-208px)] z-20 flex flex-col items-end"
      />
      <div className="fixed bottom-6 right-6 sm:right-[calc(50%-208px)] z-20 flex flex-row items-center gap-2">
        {unreadScribbles > 0 && (
          <button
            onClick={() => setShowScribbleInbox(true)}
            className="relative bg-pink-500 text-white rounded-xl px-3 py-2 shadow-lg text-xs font-medium whitespace-nowrap hover:bg-pink-600 active:scale-95 transition-all"
          >
            ✏️ {unreadScribbles === 1
              ? "1 个成语等你猜!"
              : `${unreadScribbles} 个成语等你猜!`}
            <span className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-pink-500 rotate-45" />
          </button>
        )}
        <div className="relative">
          <ScribbleFAB
            onClick={() => {
              if (unreadScribbles > 0) setShowScribbleInbox(true);
              else setShowScribble(true);
            }}
            className="bg-[#2B4B8C] text-white w-14 h-14 rounded-full text-xl shadow-lg hover:bg-[#1e3a70] active:scale-95 transition-transform flex items-center justify-center"
          />
          {unreadScribbles > 0 && (
            <button
              onClick={() => setShowScribbleInbox(true)}
              className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-white dark:ring-gray-900"
              aria-label={`${unreadScribbles} unread scribbles`}
            >
              {unreadScribbles}
            </button>
          )}
        </div>
      </div>

      {showCheckIn && checkIn !== null && (
        <CheckInModal
          totalDays={checkIn.totalDays}
          todayCheckedIn={checkIn.todayCheckedIn}
          todayEmoji={checkIn.todayEmoji}
          onClose={() => setShowCheckIn(false)}
          onCheckIn={(newTotal, emoji) =>
            setCheckIn({ totalDays: newTotal, todayCheckedIn: true, todayEmoji: emoji })
          }
        />
      )}

      {showNew && <NewListModal onClose={() => setShowNew(false)} />}
      {showScribble && <ScribbleModal onClose={() => setShowScribble(false)} />}
      {showScribbleInbox && (
        <ScribbleInboxModal
          scribbles={scribbleInbox}
          onClose={() => setShowScribbleInbox(false)}
          onGuessed={(id, result) =>
            setScribbleInbox((prev) =>
              prev.map((s) =>
                s.id === id
                  ? {
                      ...s,
                      guess: result.guess,
                      guessGrade: result.grade,
                      guessedAt: Date.now(),
                      word: result.word,
                      drawerDescription: result.drawerDescription || s.drawerDescription,
                      pinyin: result.pinyin || s.pinyin,
                      explanation: result.explanation || s.explanation,
                    }
                  : s
              )
            )
          }
        />
      )}
    </div>
  );
}
