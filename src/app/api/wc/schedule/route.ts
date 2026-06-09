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
};

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
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

  let espn: EspnResponse;
  try {
    // Edge cache for 60s — match data only moves on live updates, so a short
    // TTL is fine and keeps us well clear of any unstated rate limits.
    // Edge cache for 60s via Next's revalidate; the Cloudflare-specific `cf`
    // init was removed to keep types clean. 60s TTL is well under any sane
    // rate limit and matches live-update cadence.
    const r = await fetch(target, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!r.ok) {
      return NextResponse.json({ error: `Upstream ${r.status}` }, { status: 502 });
    }
    espn = (await r.json()) as EspnResponse;
  } catch {
    return NextResponse.json({ error: "Failed to fetch upstream" }, { status: 502 });
  }

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
      return {
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
      };
    })
    .filter((m): m is Match => m !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
