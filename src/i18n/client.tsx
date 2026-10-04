"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Locale } from "./index";

const LocaleContext = createContext<Locale>("en");

/** Root-layout provider: client components read the language with useT(). */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useT() {
  const locale = useContext(LocaleContext);
  return useMemo(() => makeT(locale), [locale]);
}
