import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type CountryOption = { code: CountryCode; name: string; dial: string; flag: string };

function flagOf(code: string): string {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** All countries, the clinic's own first, then alphabetical by name (named in `language`: "en", "hi"). */
export function countryOptions(first: string, language = "en"): CountryOption[] {
  const regionNames = new Intl.DisplayNames([language], { type: "region" });
  const all = getCountries().map((code) => ({
    code,
    name: regionNames.of(code) ?? code,
    dial: `+${getCountryCallingCode(code)}`,
    flag: flagOf(code),
  }));
  all.sort((a, b) => (a.code === first ? -1 : b.code === first ? 1 : a.name.localeCompare(b.name, language)));
  return all;
}

export function isCountryCode(value: string): value is CountryCode {
  return (getCountries() as string[]).includes(value);
}

/**
 * Parse what the physio typed into E.164 (+919876543210). A number typed with
 * its own "+code" wins over the selected country. Validates length per country
 * rather than exact digit patterns, so newly issued number ranges aren't rejected.
 */
export function toE164(input: string, country: string): string | null {
  const parsed = parsePhoneNumberFromString(input, isCountryCode(country) ? country : "IN");
  return parsed?.isPossible() ? parsed.number : null;
}

/** Split a stored E.164 number back into country + national number for editing. */
export function splitE164(phone: string | null, fallbackCountry: string): { country: string; national: string } {
  const parsed = phone ? parsePhoneNumberFromString(phone) : undefined;
  return parsed
    ? { country: parsed.country ?? fallbackCountry, national: parsed.nationalNumber }
    : { country: fallbackCountry, national: phone ?? "" };
}

export function formatPhone(phone: string): string {
  return parsePhoneNumberFromString(phone)?.formatInternational() ?? phone;
}
