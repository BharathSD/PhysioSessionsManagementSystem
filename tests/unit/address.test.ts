import { describe, expect, it } from "vitest";
import { addressLines, fromOsm, mapsLink, matchState, postalCodeProblem } from "@/lib/address";

const home = { address: "Flat 4B, Sea View", address_line2: "Bandra West", city: "Mumbai", state: "Maharashtra", postal_code: "400050", address_country: "IN" };

describe("addresses", () => {
  it("are shown as lines, with the country only when it isn't the clinic's", () => {
    expect(addressLines(home, "IN")).toEqual(["Flat 4B, Sea View", "Bandra West", "Mumbai – 400050", "Maharashtra"]);
    expect(addressLines(home, "AE").at(-1)).toBe("India");
    expect(addressLines({ address: "12 MG Road\nIndiranagar" }, "IN")).toEqual(["12 MG Road", "Indiranagar"]);
  });

  it("link to Maps by the pin when there is one", () => {
    expect(mapsLink({ ...home, latitude: 19.06, longitude: 72.83 }, "IN")).toBe("https://www.google.com/maps/search/?api=1&query=19.06,72.83");
    expect(mapsLink(home, "IN")).toContain(encodeURIComponent("Bandra West, Mumbai – 400050"));
    expect(mapsLink({}, "IN")).toBeNull();
  });

  it("check PIN codes", () => {
    expect(postalCodeProblem("400050", "IN")).toBeNull();
    expect(postalCodeProblem("040050", "IN")).toBe("PIN code should be 6 digits.");
    expect(postalCodeProblem("SW1A 1AA", "GB")).toBeNull();
    expect(postalCodeProblem("", "IN")).toBeNull();
  });

  it("match state names from the map to our list", () => {
    expect(matchState("tamil nadu", "IN")).toBe("Tamil Nadu");
    expect(matchState("NCT of Delhi", "IN")).toBe("Delhi");
    expect(matchState("Jammu & Kashmir", "IN")).toBe("Jammu and Kashmir");
    expect(matchState("Dubai", "AE")).toBe("Dubai");
  });

  it("are filled in from an OpenStreetMap lookup", () => {
    expect(
      fromOsm({ house_number: "14", road: "14th Road", suburb: "Khar West", city: "Mumbai", state: "Maharashtra", postcode: "400 052", country_code: "in" }),
    ).toEqual({ address: "14, 14th Road", address_line2: "Khar West", city: "Mumbai", state: "Maharashtra", postal_code: "400052", address_country: "IN" });
    expect(fromOsm({ village: "Kodikanal", state: "Tamil Nadu", country_code: "in" })).toEqual({ city: "Kodikanal", state: "Tamil Nadu", address_country: "IN" });
  });
});
