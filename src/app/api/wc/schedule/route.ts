import { NextResponse } from "next/server";

// FIFA World Cup 2026 schedule, sourced from ESPN's public (undocumented but
// long-stable) scoreboard endpoint. We re-shape the response into a compact
// shape the client can render without doing its own parsing.
//
// Note on flags: ESPN exposes each country's team logo at
//   https://a.espncdn.com/i/teamlogos/countries/500/{abbr}.png
// which for national teams in WC context is effectively the country flag/
// crest. We pass that URL straight through — no flag-mapping table to keep
// in sync.

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

// Kalshi prediction-market endpoint. The public-unauth `markets` endpoint
// returns the live yes/no bid/ask in dollar units (string), plus 24h volume
// — everything we need for the UI without an API key. `KXWCGAME` is the
// per-match winner series; one event has 3 markets (home / away / tie).
const KALSHI_MARKETS_URL =
  "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXWCGAME&limit=300&status=open";

// ESPN and Kalshi mostly agree on 3-letter team codes, but a few diverge.
// Add entries here as we discover them in production.
const ESPN_TO_KALSHI_ABBR: Record<string, string> = {
  HAI: "HTI", // Haiti — ESPN uses HAI, Kalshi uses HTI (ISO 3166).
  IRN: "IRI", // Iran — ESPN uses IRN (ISO 3166 alpha-3 IRN), Kalshi IRI (FIFA).
  ALG: "DZA", // Algeria — ESPN ALG (FIFA), Kalshi DZA (ISO 3166).
};

function kalshiAbbr(espnAbbr: string): string {
  return ESPN_TO_KALSHI_ABBR[espnAbbr] ?? espnAbbr;
}

type EspnCompetitor = {
  homeAway: "home" | "away";
  winner?: boolean;
  score?: string;
  team: {
    id: string;
    abbreviation?: string;
    displayName?: string;
    shortDisplayName?: string;
    logo?: string;
    color?: string;
  };
};

type EspnEvent = {
  id: string;
  date: string;
  name?: string;
  shortName?: string;
  competitions: Array<{
    date: string;
    status: {
      type: {
        state: "pre" | "in" | "post";
        completed: boolean;
        description: string;
        detail: string;
        shortDetail: string;
      };
    };
    venue?: {
      fullName?: string;
      address?: { city?: string; country?: string };
    };
    competitors: EspnCompetitor[];
    broadcasts?: Array<{ market?: string; names?: string[] }>;
  }>;
};

type EspnResponse = {
  events?: EspnEvent[];
};

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
  // All prices are in dollars (0.0 to 1.0). Null when the market has no quote
  // (e.g. nobody has posted a bid yet, or the side hasn't traded).
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
  date: string; // ISO UTC
  state: "pre" | "in" | "post";
  completed: boolean;
  statusShort: string; // "Scheduled" / "FT" / "1H"
  statusDetail: string; // "Thu, June 11th at 3:00 PM EDT"
  home: Side;
  away: Side;
  venue: string | null;
  city: string | null;
  country: string | null;
  broadcasters: string[];
  // Kalshi prediction-market odds; null when we couldn't find a matching
  // market (Kalshi only covers select matches and team-code mismatches happen).
  odds: MatchOdds | null;
};

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

type KalshiMarket = {
  ticker: string;
  event_ticker?: string;
  yes_sub_title?: string;
  yes_bid_dollars?: string | null;
  yes_ask_dollars?: string | null;
  last_price_dollars?: string | null;
  volume_24h_fp?: string | null;
};

type KalshiMarketsResponse = { markets?: KalshiMarket[] };

const MONTH_CODE: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function parseDollars(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Build a date+team → odds index from Kalshi's bulk markets response. Keys are
// `YYYY-MM-DD|HOME|AWAY` where date is the Kalshi-side local match date.
async function fetchKalshiOdds(): Promise<Map<string, MatchOdds>> {
  const map = new Map<string, MatchOdds>();
  let raw: KalshiMarketsResponse;
  try {
    const r = await fetch(KALSHI_MARKETS_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!r.ok) return map;
    raw = (await r.json()) as KalshiMarketsResponse;
  } catch {
    return map;
  }

  // Group markets by event ticker; each KXWCGAME event has 3 markets
  // (home / away / tie). Ticker format: `KXWCGAME-{YY}{MMM}{DD}{HOMEAWAY}-{SIDE}`.
  const byEvent = new Map<string, KalshiMarket[]>();
  for (const m of raw.markets ?? []) {
    const dash = m.ticker.lastIndexOf("-");
    if (dash < 0) continue;
    const eventTicker = m.ticker.slice(0, dash);
    const list = byEvent.get(eventTicker);
    if (list) list.push(m); else byEvent.set(eventTicker, [m]);
  }

  const eventRe = /^KXWCGAME-(\d{2})([A-Z]{3})(\d{2})([A-Z]{3})([A-Z]{3})$/;
  for (const [eventTicker, markets] of byEvent) {
    const m = eventRe.exec(eventTicker);
    if (!m) continue;
    const [, yy, mon, dd, home, away] = m;
    const month = MONTH_CODE[mon];
    if (!month) continue;
    const dateKey =
      `20${yy}-${String(month).padStart(2, "0")}-${dd}`;

    const sideTicker = (suffix: string) =>
      markets.find((mm) => mm.ticker.endsWith(`-${suffix}`));
    const toOdds = (mk: KalshiMarket | undefined): OddsSide => ({
      marketTicker: mk?.ticker ?? "",
      yesBid: parseDollars(mk?.yes_bid_dollars),
      yesAsk: parseDollars(mk?.yes_ask_dollars),
      lastPrice: parseDollars(mk?.last_price_dollars),
      volume24h: parseDollars(mk?.volume_24h_fp),
    });

    const homeMkt = sideTicker(home);
    const awayMkt = sideTicker(away);
    const tieMkt = sideTicker("TIE");
    if (!homeMkt || !awayMkt) continue;

    map.set(`${dateKey}|${home}|${away}`, {
      eventTicker,
      home: toOdds(homeMkt),
      away: toOdds(awayMkt),
      tie: toOdds(tieMkt),
    });
  }
  return map;
}

// Try the ESPN match's UTC date and a ±1-day window, since Kalshi tags each
// event by the local (US/host-city) match date — a UTC-late kickoff (e.g.
// 2026-06-13T01:00Z USA-Paraguay) actually shows up as 26JUN12 on Kalshi.
function findOdds(
  index: Map<string, MatchOdds>,
  match: Match
): MatchOdds | null {
  const home = kalshiAbbr(match.home.abbr);
  const away = kalshiAbbr(match.away.abbr);
  const d = new Date(match.date);
  for (const offsetDays of [0, -1, 1]) {
    const tryDate = new Date(d.getTime() + offsetDays * 86_400_000);
    const dateKey = tryDate.toISOString().slice(0, 10);
    const hit = index.get(`${dateKey}|${home}|${away}`);
    if (hit) return hit;
  }
  return null;
}

function sideFromCompetitor(c: EspnCompetitor): Side {
  const scoreNum = c.score != null && c.score !== "" ? Number(c.score) : NaN;
  return {
    id: c.team.id,
    name: c.team.displayName ?? c.team.shortDisplayName ?? c.team.abbreviation ?? "—",
    abbr: c.team.abbreviation ?? "—",
    logo: c.team.logo ?? "",
    score: Number.isFinite(scoreNum) ? scoreNum : null,
    winner: Boolean(c.winner),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Defaults: look 2 days back and 7 days forward — covers "recent results"
  // and "next 7 days" with a single query.
  const daysBack = Math.max(0, Math.min(30, Number(url.searchParams.get("back") ?? 2)));
  const daysAhead = Math.max(1, Math.min(30, Number(url.searchParams.get("ahead") ?? 7)));

  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - daysBack);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + daysAhead);

  const target = `${ESPN_URL}?dates=${ymd(from)}-${ymd(to)}`;

  // Fetch ESPN schedule + Kalshi odds in parallel. Kalshi failure is non-fatal
  // — we just return matches without odds in that case.
  let espn: EspnResponse;
  let oddsIndex: Map<string, MatchOdds>;
  try {
    const [espnRes, kalshi] = await Promise.all([
      fetch(target, {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      }),
      fetchKalshiOdds(),
    ]);
    if (!espnRes.ok) {
      return NextResponse.json({ error: `Upstream ${espnRes.status}` }, { status: 502 });
    }
    espn = (await espnRes.json()) as EspnResponse;
    oddsIndex = kalshi;
  } catch {
    return NextResponse.json({ error: "Failed to fetch upstream" }, { status: 502 });
  }

  // Local dev affordance: ?demo=1 mutates the first two matches into a
  // finished+live pair so we can visually QA those states before the
  // tournament actually kicks off. Toggle by hitting /lists?demo=1.
  const demo = url.searchParams.get("demo") === "1";

  const matches: Match[] = (espn.events ?? [])
    .map((e): Match | null => {
      const comp = e.competitions?.[0];
      if (!comp) return null;
      const home = comp.competitors.find((c) => c.homeAway === "home");
      const away = comp.competitors.find((c) => c.homeAway === "away");
      if (!home || !away) return null;
      const broadcasters = (comp.broadcasts ?? [])
        .flatMap((b) => b.names ?? [])
        .filter((s, i, arr) => s && arr.indexOf(s) === i);
      const match: Match = {
        id: e.id,
        date: comp.date ?? e.date,
        state: comp.status.type.state,
        completed: comp.status.type.completed,
        statusShort: comp.status.type.shortDetail,
        statusDetail: comp.status.type.detail,
        home: sideFromCompetitor(home),
        away: sideFromCompetitor(away),
        venue: comp.venue?.fullName ?? null,
        city: comp.venue?.address?.city ?? null,
        country: comp.venue?.address?.country ?? null,
        broadcasters,
        odds: null,
      };
      match.odds = findOdds(oddsIndex, match);
      return match;
    })
    .filter((m): m is Match => m !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (demo && matches.length >= 2) {
    // Completed match: home wins 2-1.
    const m0 = matches[0];
    matches[0] = {
      ...m0,
      state: "post",
      completed: true,
      statusShort: "FT",
      home: { ...m0.home, score: 2, winner: true },
      away: { ...m0.away, score: 1, winner: false },
    };
    // Live match: home leads 1-0 at the 67th minute.
    const m1 = matches[1];
    matches[1] = {
      ...m1,
      state: "in",
      completed: false,
      statusShort: "67'",
      home: { ...m1.home, score: 1 },
      away: { ...m1.away, score: 0 },
    };
  }

  return NextResponse.json(
    { matches, fetchedAt: now.toISOString() },
    {
      headers: {
        // Browser/client cache: 30s fresh, 60s stale-while-revalidate.
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}
