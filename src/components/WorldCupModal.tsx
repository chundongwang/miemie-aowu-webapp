"use client";

import { useEffect, useState } from "react";
import { localizeCity, localizeCountry } from "@/lib/wcLocations";

type Side = {
  id: string;
  name: string;
  abbr: string;
  logo: string;
  score: number | null;
  winner: boolean;
};

type Match = {
  id: string;
  date: string;
  state: "pre" | "in" | "post";
  completed: boolean;
  statusShort: string;
  statusDetail: string;
  home: Side;
  away: Side;
  venue: string | null;
  city: string | null;
  country: string | null;
  broadcasters: string[];
};

type ApiResponse = {
  matches: Match[];
  fetchedAt: string;
};

// Day header label. Today / Tomorrow / Yesterday are friendly; older or
// further-out days fall back to a short "M月D日 周X" form.
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayD = new Date();
  const today = new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate()).getTime();
  const dayDiff = Math.round((day - today) / 86_400_000);
  if (dayDiff === 0) return "今天";
  if (dayDiff === 1) return "明天";
  if (dayDiff === -1) return "昨天";
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${weekdays[d.getDay()]}`;
}

function localTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function groupByDay(matches: Match[]): Array<{ key: string; label: string; items: Match[] }> {
  const groups = new Map<string, Match[]>();
  for (const m of matches) {
    const d = new Date(m.date);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: dayLabel(items[0].date),
    items,
  }));
}

function TeamRow({ side, finished, showScore }: { side: Side; finished: boolean; showScore: boolean }) {
  // Once the match is over, the loser is dimmed and the winner is bold; while
  // it's pre/in we show both teams equally.
  const dim = finished && !side.winner;
  return (
    <div className={`flex items-center gap-2 min-w-0 ${dim ? "opacity-50" : ""}`}>
      {side.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={side.logo}
          alt={side.abbr}
          className="w-6 h-6 object-contain shrink-0"
          loading="lazy"
        />
      ) : (
        <span className="w-6 h-6 shrink-0 rounded bg-gray-700" />
      )}
      <span
        className={`truncate text-sm ${side.winner ? "font-semibold text-white" : "text-gray-200"}`}
        title={side.name}
      >
        {side.name}
      </span>
      {showScore && side.score != null && (
        <span className="ml-auto tabular-nums text-sm shrink-0">{side.score}</span>
      )}
    </div>
  );
}

function MatchRow({ m }: { m: Match }) {
  const live = m.state === "in";
  const finished = m.state === "post";
  // ESPN sets score = "0" for both sides on scheduled matches; only show
  // scores once the match is actually live or final.
  const showScore = live || finished;
  return (
    <div className="rounded-lg bg-gray-800 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] text-gray-400">
        <span className="tabular-nums shrink-0">{localTime(m.date)}</span>
        {m.venue && (() => {
          const city = localizeCity(m.city);
          const country = localizeCountry(m.country);
          // Show Chinese inline when we have it, with English right next to
          // it (slash-joined). Falls back gracefully when only English is
          // known. State suffix (e.g. ", California") is dropped — too long
          // for a single mobile row, and "California" doesn't translate well.
          const cityLabel = city
            ? city.zh
              ? `${city.zh}/${city.en}`
              : city.en
            : null;
          const countryLabel = country
            ? country.zh
              ? `${country.zh}/${country.en}`
              : country.en
            : null;
          const locParts = [cityLabel, countryLabel].filter(Boolean) as string[];
          return (
            <span
              className="truncate"
              title={[m.venue, m.city, m.country].filter(Boolean).join(", ")}
            >
              · {m.venue}
              {locParts.length > 0 && (
                <span className="text-gray-500">{" · "}{locParts.join(", ")}</span>
              )}
            </span>
          );
        })()}
        <span className="ml-auto shrink-0">
          {live ? (
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-semibold uppercase tracking-wider">
              LIVE
            </span>
          ) : finished ? (
            <span className="text-gray-500">{m.statusShort || "FT"}</span>
          ) : (
            <span className="text-gray-500">即将开始</span>
          )}
        </span>
      </div>
      <TeamRow side={m.home} finished={finished} showScore={showScore} />
      <TeamRow side={m.away} finished={finished} showScore={showScore} />
    </div>
  );
}

export default function WorldCupModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/wc/schedule?back=2&ahead=7")
      .then((r) => (r.ok ? r.json() as Promise<ApiResponse> : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setError(e.message || "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const groups = data ? groupByDay(data.matches) : [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0"
        style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
      >
        <button onClick={onClose} className="text-white text-2xl leading-none opacity-60 hover:opacity-100">×</button>
        <div className="text-center flex-1 mx-2 min-w-0">
          <p className="text-sm font-semibold">2026 世界杯</p>
          <p className="text-[10px] text-gray-400">最近 2 天 + 未来 7 天</p>
        </div>
        <div className="w-6" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {loading && (
          <p className="text-center text-sm text-gray-400 animate-pulse py-12">加载中…</p>
        )}
        {error && !loading && (
          <p className="text-center text-sm text-red-400 py-12">{error}</p>
        )}
        {!loading && !error && groups.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-12">这段时间没有安排比赛</p>
        )}
        {groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <h3 className="text-[11px] uppercase tracking-wider text-gray-500 sticky top-0 bg-gray-900/90 backdrop-blur-sm py-1">
              {g.label}
            </h3>
            <div className="space-y-2">
              {g.items.map((m) => <MatchRow key={m.id} m={m} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
