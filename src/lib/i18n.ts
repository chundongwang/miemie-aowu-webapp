import { headers } from "next/headers";
import { translations, tr, type Locale, type TranslationKey } from "./translations";

export async function getLocale(): Promise<Locale> {
  const h = await headers();
  const raw = h.get("accept-language") ?? "";
  const primary = raw.split(",")[0].trim().toLowerCase();
  return primary.startsWith("zh") ? "zh" : "en";
}

/** For use in server components — returns a bound t() for the request locale. */
export async function getT() {
  const locale = await getLocale();
  return {
    locale,
    t: (key: TranslationKey, vars?: Record<string, string | number>) =>
      tr(locale, key, vars),
    translations: translations[locale],
  };
}
