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

// Stadium names. Many WC 2026 venues are corporate-sponsored, so the Chinese
// rendering is mostly a transliteration of the original. Add entries here as
// we encounter new venues; unmapped venues fall back to their English name.
const VENUE_ZH: Record<string, string> = {
  // Mexico
  "Estadio Banorte":         "班诺特体育场",
  "Estadio Akron":           "阿克隆体育场",
  "Estadio BBVA":            "BBVA 体育场",
  // Canada
  "BMO Field":               "BMO 球场",
  "BC Place":                "BC 体育场",
  // USA
  "SoFi Stadium":            "索菲体育场",
  "Levi's Stadium":          "李维斯体育场",
  "MetLife Stadium":         "大都会人寿体育场",
  "Lumen Field":             "鲁门球场",
  "Gillette Stadium":        "吉列体育场",
  "AT&T Stadium":            "AT&T 体育场",
  "NRG Stadium":             "NRG 体育场",
  "Mercedes-Benz Stadium":   "梅赛德斯-奔驰体育场",
  "Hard Rock Stadium":       "硬石体育场",
  "Lincoln Financial Field": "林肯金融球场",
  "Arrowhead Stadium":       "箭头体育场",
};

export function localizeVenue(
  raw: string | null | undefined
): { zh: string | null; en: string } | null {
  if (!raw) return null;
  return { zh: VENUE_ZH[raw] ?? null, en: raw };
}

// Chinese names for the 48 national teams competing in WC 2026. Includes
// common variants of ambiguous English forms (Korea Republic vs South Korea,
// Türkiye vs Turkiye vs Turkey, Côte d'Ivoire vs Ivory Coast, etc.).
const TEAM_ZH: Record<string, string> = {
  // Africa
  "Algeria":                "阿尔及利亚",
  "Cape Verde":             "佛得角",
  "Côte d'Ivoire":          "科特迪瓦",
  "Ivory Coast":            "科特迪瓦",
  "DR Congo":               "刚果（金）",
  "Congo DR":               "刚果（金）",
  "Egypt":                  "埃及",
  "Ghana":                  "加纳",
  "Morocco":                "摩洛哥",
  "Senegal":                "塞内加尔",
  "South Africa":           "南非",
  "Tunisia":                "突尼斯",
  // Asia
  "Australia":              "澳大利亚",
  "Iran":                   "伊朗",
  "IR Iran":                "伊朗",
  "Iraq":                   "伊拉克",
  "Japan":                  "日本",
  "Jordan":                 "约旦",
  "Korea Republic":         "韩国",
  "South Korea":            "韩国",
  "Qatar":                  "卡塔尔",
  "Saudi Arabia":           "沙特阿拉伯",
  "Uzbekistan":             "乌兹别克斯坦",
  // Europe
  "Austria":                "奥地利",
  "Belgium":                "比利时",
  "Croatia":                "克罗地亚",
  "Czechia":                "捷克",
  "Czech Republic":         "捷克",
  "England":                "英格兰",
  "France":                 "法国",
  "Germany":                "德国",
  "Italy":                  "意大利",
  "Netherlands":            "荷兰",
  "Norway":                 "挪威",
  "Portugal":               "葡萄牙",
  "Scotland":               "苏格兰",
  "Spain":                  "西班牙",
  "Sweden":                 "瑞典",
  "Switzerland":            "瑞士",
  "Türkiye":                "土耳其",
  "Turkiye":                "土耳其",
  "Turkey":                 "土耳其",
  // North + Central America
  "Bosnia and Herzegovina": "波黑",
  "Bosnia-Herzegovina":     "波黑",
  "Canada":                 "加拿大",
  "Curacao":                "库拉索",
  "Curaçao":                "库拉索",
  "Haiti":                  "海地",
  "Mexico":                 "墨西哥",
  "Panama":                 "巴拿马",
  "USA":                    "美国",
  "United States":          "美国",
  // Oceania
  "New Zealand":            "新西兰",
  // South America
  "Argentina":              "阿根廷",
  "Brazil":                 "巴西",
  "Colombia":               "哥伦比亚",
  "Ecuador":                "厄瓜多尔",
  "Paraguay":               "巴拉圭",
  "Uruguay":                "乌拉圭",
};

export function localizeTeam(
  raw: string | null | undefined
): { zh: string | null; en: string } | null {
  if (!raw) return null;
  return { zh: TEAM_ZH[raw] ?? null, en: raw };
}
