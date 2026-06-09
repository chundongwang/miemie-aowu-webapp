// Localization + metro-area normalization for the FIFA World Cup 2026 venues.
//
// ESPN returns the literal stadium city (e.g. "Inglewood, California" for
// SoFi Stadium), but in conversational use we want the metro people
// recognize — "Los Angeles" rather than "Inglewood". This table maps every
// suburb / venue-city ESPN might return to its host-metro pair (English +
// 中文). Keys include both the "City, State" form and the bare-city form so
// we hit a direct lookup either way.

const COUNTRY_ZH: Record<string, string> = {
  USA: "美国",
  "United States": "美国",
  Mexico: "墨西哥",
  Canada: "加拿大",
};

type CityPair = { en: string; zh: string };

const CITY_TO_METRO: Record<string, CityPair> = {
  // USA host metros — the venue suburb is rewritten to the host-city label.
  "Atlanta, Georgia":            { en: "Atlanta",       zh: "亚特兰大" },
  Atlanta:                       { en: "Atlanta",       zh: "亚特兰大" },
  "Foxborough, Massachusetts":   { en: "Boston",        zh: "波士顿" },
  Foxborough:                    { en: "Boston",        zh: "波士顿" },
  Boston:                        { en: "Boston",        zh: "波士顿" },
  "Arlington, Texas":            { en: "Dallas",        zh: "达拉斯" },
  Arlington:                     { en: "Dallas",        zh: "达拉斯" },
  Dallas:                        { en: "Dallas",        zh: "达拉斯" },
  "Houston, Texas":              { en: "Houston",       zh: "休斯敦" },
  Houston:                       { en: "Houston",       zh: "休斯敦" },
  "Kansas City, Missouri":       { en: "Kansas City",   zh: "堪萨斯城" },
  "Kansas City":                 { en: "Kansas City",   zh: "堪萨斯城" },
  "Inglewood, California":       { en: "Los Angeles",   zh: "洛杉矶" },
  Inglewood:                     { en: "Los Angeles",   zh: "洛杉矶" },
  "Los Angeles, California":     { en: "Los Angeles",   zh: "洛杉矶" },
  "Los Angeles":                 { en: "Los Angeles",   zh: "洛杉矶" },
  "Miami Gardens, Florida":      { en: "Miami",         zh: "迈阿密" },
  "Miami Gardens":               { en: "Miami",         zh: "迈阿密" },
  Miami:                         { en: "Miami",         zh: "迈阿密" },
  "East Rutherford, New Jersey": { en: "New York",      zh: "纽约" },
  "East Rutherford":             { en: "New York",      zh: "纽约" },
  "New York":                    { en: "New York",      zh: "纽约" },
  "Philadelphia, Pennsylvania":  { en: "Philadelphia",  zh: "费城" },
  Philadelphia:                  { en: "Philadelphia",  zh: "费城" },
  "Santa Clara, California":     { en: "San Francisco", zh: "旧金山" },
  "Santa Clara":                 { en: "San Francisco", zh: "旧金山" },
  "San Francisco, California":   { en: "San Francisco", zh: "旧金山" },
  "San Francisco":               { en: "San Francisco", zh: "旧金山" },
  "Seattle, Washington":         { en: "Seattle",       zh: "西雅图" },
  Seattle:                       { en: "Seattle",       zh: "西雅图" },
  // Canada host metros.
  "Toronto, Ontario":            { en: "Toronto",       zh: "多伦多" },
  Toronto:                       { en: "Toronto",       zh: "多伦多" },
  "Vancouver, British Columbia": { en: "Vancouver",     zh: "温哥华" },
  Vancouver:                     { en: "Vancouver",     zh: "温哥华" },
  // Mexico host metros — host city == venue city, no rewrite needed.
  "Mexico City":                 { en: "Mexico City",   zh: "墨西哥城" },
  Guadalajara:                   { en: "Guadalajara",   zh: "瓜达拉哈拉" },
  Monterrey:                     { en: "Monterrey",     zh: "蒙特雷" },
};

// Maps an ESPN-returned city string to its host-metro (English + 中文).
// Falls back to the raw value (state suffix stripped) when the metro is
// unknown so we never lose information.
export function localizeCity(
  raw: string | null | undefined
): { zh: string | null; en: string } | null {
  if (!raw) return null;
  const bare = raw.split(",")[0]?.trim() || raw;
  const hit = CITY_TO_METRO[raw] ?? CITY_TO_METRO[bare];
  if (hit) return { zh: hit.zh, en: hit.en };
  return { zh: null, en: bare };
}

export function localizeCountry(
  raw: string | null | undefined
): { zh: string | null; en: string } | null {
  if (!raw) return null;
  return { zh: COUNTRY_ZH[raw] ?? null, en: raw };
}
