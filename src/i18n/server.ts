import { cookies } from "next/headers";
import { cache } from "react";
import { isLocale, makeT, type Locale } from "./index";

/** Cookie holding the app language on this device (set from Profile, or at sign-in from the saved choice). */
export const LANG_COOKIE = "lang";

export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLocale(value) ? value : "en";
});

/** The translator for this request: `const t = await getT()`. */
export const getT = cache(async () => makeT(await getLocale()));

/** A page's translated browser-tab title: `export const generateMetadata = titled(msg("Days off"));` */
export const titled = (title: string) => async () => ({ title: (await getT())(title) });
