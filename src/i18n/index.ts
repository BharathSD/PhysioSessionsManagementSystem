// Translations. Text is written in English in the code and looked up in the
// language's dictionary (English wording = the key); anything missing falls
// back to English. `npm test` fails if a t("…") text has no Hindi yet.
//
// Adding a language: copy hi.ts to <code>.ts, translate the right-hand sides,
// and add it to LOCALES / DICTS / INTL below.

import { formatDate, formatDay, formatMoney } from "@/lib/format";
import { hi } from "./hi";

export const LOCALES = { en: "English", hi: "हिन्दी" } as const;
export type Locale = keyof typeof LOCALES;
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && v in LOCALES;

const DICTS: Record<Locale, Record<string, string> | null> = { en: null, hi };
const INTL: Record<Locale, string> = { en: "en-IN", hi: "hi-IN" };

export type Vars = Record<string, string | number>;

/** t("Hello {name}", { name }) plus date / money formatting in the same language. */
export type T = ((text: string, vars?: Vars) => string) & {
  locale: Locale;
  /** For Intl formatters: "en-IN" / "hi-IN". */
  intl: string;
  date: (iso: string) => string;
  day: (iso: string) => string;
  money: (amount: number, currency?: string) => string;
  /** Short weekday name for ISO weekday 1 (Mon) … 7 (Sun). */
  weekday: (n: number) => string;
};

export function makeT(locale: Locale): T {
  const dict = DICTS[locale];
  const t = ((text: string, vars?: Vars) => {
    const s = dict?.[text] ?? text;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
  }) as T;
  t.locale = locale;
  t.intl = INTL[locale];
  t.date = (iso) => formatDate(iso, INTL[locale]);
  t.day = (iso) => formatDay(iso, INTL[locale]);
  t.money = (amount, currency) => formatMoney(amount, currency, INTL[locale]);
  const weekdays = new Intl.DateTimeFormat(INTL[locale], { weekday: "short", timeZone: "UTC" });
  t.weekday = (n) => weekdays.format(new Date(Date.UTC(2024, 0, n))); // 1 Jan 2024 was a Monday
  return t;
}

/** English — the default for library functions that build text. */
export const EN = makeT("en");

/** The dictionary for a language (for the completeness test). */
export const dictionaryOf = (locale: Locale) => DICTS[locale];

/** Marks English text kept in a list or table, translated where it's shown with t(). */
export const msg = <S extends string>(text: S): S => text;
