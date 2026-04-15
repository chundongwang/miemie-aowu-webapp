"use client";

import { createContext, useContext } from "react";
import { tr, type Locale, type TranslationKey } from "@/lib/translations";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

/** Returns a t() function bound to the current locale. Use in any client component. */
export function useT() {
  const locale = useContext(LocaleContext);
  return (key: TranslationKey, vars?: Record<string, string | number>) =>
    tr(locale, key, vars);
}

/** Returns the current locale string ("en" | "zh"). */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}
