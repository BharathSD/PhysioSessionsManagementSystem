// Patient addresses: stored in parts (as a professional writes them), shown as
// lines, and linked to Maps — by the map pin when there is one.

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export type Address = {
  address: string | null; // line 1: house / flat no., building, street
  address_line2: string | null; // area, locality, landmark
  city: string | null;
  state: string | null;
  postal_code: string | null;
  address_country: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** India's 28 states and 8 union territories. */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

/** The state as spelled in our list ("tamil nadu" → "Tamil Nadu"), or as given. */
export function matchState(state: string, country: string): string {
  if (country !== "IN") return state;
  const s = state.trim().toLowerCase().replace(/^nct of /, "").replace(/&/g, "and");
  return INDIAN_STATES.find((x) => x.toLowerCase() === s) ?? state.trim();
}

/** null = fine (or empty), otherwise what's wrong. India's PIN codes are 6 digits, not starting with 0. */
export function postalCodeProblem(code: string, country: string): string | null {
  if (!code) return null;
  if (country === "IN") return /^[1-9]\d{5}$/.test(code) ? null : "PIN code should be 6 digits.";
  return /^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(code) ? null : "The postal code doesn't look right.";
}

/** The address as lines: street, area, "City – PIN", state, and the country if it isn't the clinic's. */
export function addressLines(a: Partial<Address>, clinicCountry: string): string[] {
  const country = a.address_country && a.address_country !== clinicCountry ? regionNames.of(a.address_country) : null;
  const cityLine = [a.city, a.postal_code].filter(Boolean).join(" – ");
  return [a.address, a.address_line2, cityLine, a.state, country].flatMap((l) => (l?.trim() ? l.split("\n").map((x) => x.trim()).filter(Boolean) : []));
}

export const hasAddress = (a: Partial<Address>) => addressLines(a, "").length > 0 || a.latitude != null;

/** A Google Maps link: the pin when there is one (exact), else the address text. */
export function mapsLink(a: Partial<Address>, clinicCountry: string): string | null {
  if (a.latitude != null && a.longitude != null) return `https://www.google.com/maps/search/?api=1&query=${a.latitude},${a.longitude}`;
  const text = addressLines(a, clinicCountry).join(", ");
  return text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}` : null;
}

type OsmAddress = Record<string, string | undefined>;

/** Address parts from an OpenStreetMap (Nominatim) lookup of a map pin. */
export function fromOsm(osm: OsmAddress): Partial<Record<"address" | "address_line2" | "city" | "state" | "postal_code" | "address_country", string>> {
  const country = osm.country_code?.toUpperCase() ?? "";
  const line1 = [osm.house_number, osm.building ?? osm.amenity, osm.road].filter(Boolean).join(", ");
  const area = [...new Set([osm.neighbourhood ?? osm.quarter ?? osm.residential, osm.suburb].filter(Boolean))].join(", ");
  const city = osm.city ?? osm.town ?? osm.village ?? osm.city_district ?? osm.county;
  const parts = {
    address: line1,
    address_line2: area,
    city,
    state: osm.state ? matchState(osm.state, country) : undefined,
    postal_code: osm.postcode?.replace(/\s+/g, country === "IN" ? "" : " "),
    address_country: /^[A-Z]{2}$/.test(country) ? country : undefined,
  };
  return Object.fromEntries(Object.entries(parts).filter(([, v]) => v)) as ReturnType<typeof fromOsm>;
}
