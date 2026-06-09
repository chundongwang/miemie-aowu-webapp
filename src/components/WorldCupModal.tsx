"use client";

import { useEffect, useState } from "react";
import { localizeCity, localizeVenue, localizeTeam } from "@/lib/wcLocations";
import { useLocale } from "@/context/LocaleContext";

type Side = {
  id: string;
  name: string;
  abbr: string;
  logo: string;
  score: number | null;
  winner: boolean;
};

type OddsSide = {
  marketTicker: string;
  yesBid: number | null;
  yesAsk: number | null;
  lastPrice: number | null;
  volume24h: number | null;
};

type MatchOdds = {
  eventTicker: string;
  home: OddsSide;
  away: OddsSide;
  tie: OddsSide;
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
  odds: MatchOdds | null;
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

// Compact "M/D HH:MM" for the Kalshi attribution. Numeric form is locale-
// neutral; the time follows browser locale (12h vs 24h). Year is dropped
// because the data is always a recent fetch.
function shortDateTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const date = `${d.getMonth() + 1}/${d.getDate()}`;
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
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

// Converts a 0..1 prediction-market price to an integer percent. Uses
// last_price when available (more stable than bid/ask which can be one-sided),
// falls back to the midpoint of bid/ask, then to whichever single side exists.
function probabilityPercent(side: OddsSide | undefined): number | null {
  if (!side) return null;
  if (side.lastPrice != null) return Math.round(side.lastPrice * 100);
  if (side.yesBid != null && side.yesAsk != null) {
    return Math.round(((side.yesBid + side.yesAsk) / 2) * 100);
  }
  if (side.yesBid != null) return Math.round(side.yesBid * 100);
  if (side.yesAsk != null) return Math.round(side.yesAsk * 100);
  return null;
}

type Tone = "home" | "away" | "tie";

const BAR_FILL: Record<Tone, string> = {
  home: "bg-yellow-400",
  away: "bg-blue-400",
  tie:  "bg-gray-400",
};

const PCT_TEXT: Record<Tone, string> = {
  home: "text-yellow-300",
  away: "text-blue-300",
  tie:  "text-gray-400",
};

function ProbabilityBar({ pct, tone }: { pct: number; tone: Tone }) {
  // Clamp so a glitchy >100% or negative doesn't blow out the card.
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-20 h-1.5 rounded-full bg-gray-700/60 overflow-hidden shrink-0">
      <div
        className={`h-full ${BAR_FILL[tone]} rounded-full transition-[width] duration-500`}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

function PercentLabel({ pct, tone }: { pct: number; tone: Tone }) {
  return (
    <span className={`tabular-nums text-xs font-semibold w-9 text-right shrink-0 ${PCT_TEXT[tone]}`}>
      {pct}%
    </span>
  );
}

function TeamRow({
  side, finished, score, pct, tone, nameLabel,
}: {
  side: Side;
  finished: boolean;
  // null when this state shouldn't render a score (e.g. pre-game).
  score: number | null;
  // null when predictions are hidden (no odds, or match is over).
  pct: number | null;
  tone: "home" | "away";
  // Display override for the team name (e.g. "巴西 ｜ Brazil" for zh users).
  // Falls back to ESPN's English name when not provided.
  nameLabel?: string;
}) {
  const dim = finished && !side.winner;
  return (
    <div className={`flex items-center gap-2 min-w-0 h-6 ${dim ? "opacity-50" : ""}`}>
      <div className="flex-1 flex items-center gap-2 min-w-0">
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
          className={`flex-1 truncate text-sm ${side.winner ? "font-semibold text-white" : "text-gray-200"}`}
          title={nameLabel ?? side.name}
        >
          {nameLabel ?? side.name}
        </span>
        {score != null && (
          <span className="tabular-nums text-base font-bold w-5 text-right shrink-0">
            {score}
          </span>
        )}
      </div>
      {pct != null && (
        <>
          <ProbabilityBar pct={pct} tone={tone} />
          <PercentLabel pct={pct} tone={tone} />
        </>
      )}
    </div>
  );
}

function MatchRow({ m, fetchedAt }: { m: Match; fetchedAt?: string }) {
  // Locale lets us localize a handful of pieces (city label, "Draw" word).
  // We deliberately only pick ONE language at a time — listing both Chinese
  // + English on every line costs horizontal space we'd rather give to the
  // Kalshi attribution + prediction bars.
  const locale = useLocale();
  const isZh = locale === "zh";
  const drawLabel = isZh ? "平局" : "Draw";

  // Team name display: when the user's locale isn't English and we have a
  // translation, show "{local} ｜ {English}" (full-width bar with breathing
  // room). Otherwise just the English name. Currently the only non-English
  // locale we support is zh, but this generalizes — anything other than "en"
  // gets the dual-language treatment if a Chinese mapping exists.
  function teamLabel(name: string): string {
    if (locale === "en") return name;
    const t = localizeTeam(name);
    if (!t || !t.zh || t.zh === t.en) return name;
    return `${t.zh} ｜ ${t.en}`;
  }
  const homeNameLabel = teamLabel(m.home.name);
  const awayNameLabel = teamLabel(m.away.name);

  const live = m.state === "in";
  const finished = m.state === "post";
  // ESPN sets score = "0" for both sides on scheduled matches; only show
  // scores once the match is actually live or final.
  const showScore = live || finished;
  // Predictions visible while the match still has unknown outcome (future +
  // live). Hide once final — the answer is on the score row by then.
  const showPredictions = !finished && m.odds != null;
  const homePct = showPredictions ? probabilityPercent(m.odds!.home) : null;
  const awayPct = showPredictions ? probabilityPercent(m.odds!.away) : null;
  const tiePct  = showPredictions ? probabilityPercent(m.odds!.tie)  : null;

  // Stadium + city share the same form across all three states so the user
  // always sees where the match is being played. Both are locale-only (one
  // language) — dual-language venue names plus dual-language cities crowd
  // the row, and the team rows above already carry the dual-language teams.
  const city = localizeCity(m.city);
  const venue = localizeVenue(m.venue);
  const cityLabel = city
    ? isZh
      ? city.zh ?? city.en
      : city.en
    : null;
  const venueLabel = venue
    ? isZh
      ? venue.zh ?? venue.en
      : venue.en
    : null;
  const venueAndCity = [venueLabel, cityLabel].filter(Boolean).join(" · ");
  const venueTitle = [m.venue, m.city, m.country].filter(Boolean).join(", ");
  const showAttribution = showPredictions && !!fetchedAt;

  // Bottom metadata. Layout is the same flex shape across states; only the
  // leading badge varies:
  //   future:    [kickoff time] · [stadium · city]                         · Kalshi · …
  //   live:      [67' in red]      · [stadium · city]                         · Kalshi · …
  //   finished:  [FINAL]            · [stadium · city]
  let leading: React.ReactNode;
  if (finished) {
    leading = (
      <span className="font-semibold tracking-wider text-gray-400 shrink-0">FINAL</span>
    );
  } else if (live) {
    leading = (
      <span className="font-semibold tracking-wider text-red-300 shrink-0">
        {m.statusShort || "LIVE"}
      </span>
    );
  } else {
    leading = (
      <span className="tabular-nums shrink-0">{localTime(m.date)}</span>
    );
  }

  const bottom = (
    <div className="flex items-baseline gap-2 min-w-0">
      {leading}
      {venueAndCity && (
        <span className="truncate" title={venueTitle}>
          · {venueAndCity}
        </span>
      )}
      {showAttribution && (
        <span className="ml-auto shrink-0 tabular-nums">
          Kalshi · {shortDateTime(fetchedAt)}
        </span>
      )}
    </div>
  );

  return (
    <div className="rounded-lg bg-gray-800 px-3 py-2 space-y-1.5">
      <TeamRow
        side={m.home}
        finished={finished}
        score={showScore ? m.home.score : null}
        pct={homePct}
        tone="home"
        nameLabel={homeNameLabel}
      />
      <TeamRow
        side={m.away}
        finished={finished}
        score={showScore ? m.away.score : null}
        pct={awayPct}
        tone="away"
        nameLabel={awayNameLabel}
      />

      {showPredictions && tiePct != null && (
        // Draw row mirrors TeamRow's column structure: empty logo slot, then
        // "Draw" filling the team-name slot, then (when scores are showing)
        // an empty score-column placeholder. That keeps the bar + percent
        // column perfectly aligned with the team rows above.
        <div className="flex items-center gap-2 min-w-0 h-6">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate text-sm text-gray-400">{drawLabel}</span>
            {showScore && <span className="w-5 shrink-0" aria-hidden="true" />}
          </div>
          <ProbabilityBar pct={tiePct} tone="tie" />
          <PercentLabel pct={tiePct} tone="tie" />
        </div>
      )}

      <div className="pt-1 text-[10px] text-gray-500 leading-tight">{bottom}</div>
    </div>
  );
}

// 60s feels like the right cadence for live football — Kalshi prices and ESPN
// scores both move on roughly that timescale, and our edge cache amortizes
// upstream calls so the actual load on ESPN/Kalshi is at most ~1 req/min/region
// regardless of how many clients are open.
const LIVE_POLL_MS = 60_000;

export default function WorldCupModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Forward ?demo=1 from the page URL so local visual QA can exercise the
  // FINAL / LIVE states without waiting for kickoff. Drop this in prod once
  // real matches are flowing.
  const scheduleUrl = (() => {
    const demo =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("demo") === "1"
        ? "&demo=1"
        : "";
    return `/api/wc/schedule?back=2&ahead=7${demo}`;
  })();

  // Initial fetch. We set loading=true so the modal shows a spinner the very
  // first time; subsequent silent polls (below) don't touch loading state so
  // the UI doesn't flash.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(scheduleUrl)
      .then((r) => (r.ok ? r.json() as Promise<ApiResponse> : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled) { setData(d); setError(""); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message || "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scheduleUrl]);

  // Live polling: re-fetch every 60s only while at least one match is "in".
  // Dependency on the boolean (not the full data) means the interval keeps
  // running smoothly across normal updates and only tears down when the
  // last live match ends. The interval is cleaned up automatically on modal
  // unmount, so we don't poll while the popup is closed.
  const hasLive = data?.matches.some((m) => m.state === "in") ?? false;
  useEffect(() => {
    if (!hasLive) return;
    const tick = () => {
      // Background poll — silently overwrite data on success, swallow errors
      // (the next tick will retry; we don't want to surface a transient
      // network blip as a full modal error).
      fetch(scheduleUrl)
        .then((r) => (r.ok ? r.json() as Promise<ApiResponse> : null))
        .then((d) => { if (d) setData(d); })
        .catch(() => {});
    };
    const i = setInterval(tick, LIVE_POLL_MS);
    return () => clearInterval(i);
  }, [hasLive, scheduleUrl]);

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
              {g.items.map((m) => <MatchRow key={m.id} m={m} fetchedAt={data?.fetchedAt} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
