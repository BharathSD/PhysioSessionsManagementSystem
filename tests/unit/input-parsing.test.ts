import { describe, expect, it } from "vitest";
import { parseDateInput, toDisplay } from "@/lib/date-input";
import { splitE164, toE164 } from "@/lib/phone";
import { safeNextPath } from "@/lib/redirect";

const TODAY = "2026-10-02";

describe("typed dates (day first, Indian order)", () => {
  it.each([
    ["02/10/2026", "2026-10-02"],
    ["2/10", "2026-10-02"],
    ["2-10-26", "2026-10-02"],
    ["2.10.2026", "2026-10-02"],
    ["02102026", "2026-10-02"],
    ["0210", "2026-10-02"],
    ["2026-10-02", "2026-10-02"],
    ["today", "2026-10-02"],
    ["tomorrow", "2026-10-03"],
    ["yesterday", "2026-10-01"],
  ])("%s → %s", (typed, iso) => {
    expect(parseDateInput(typed, TODAY)).toBe(iso);
  });

  it.each(["31/02/2026", "abc", "", "32/1"])("rejects %j", (typed) => {
    expect(parseDateInput(typed, TODAY)).toBeNull();
  });

  it("displays as DD/MM/YYYY", () => {
    expect(toDisplay("2026-10-02")).toBe("02/10/2026");
  });
});

describe("phone numbers", () => {
  it("stores Indian mobiles in international format", () => {
    expect(toE164("98765 43210", "IN")).toBe("+919876543210");
    expect(toE164("098765 43210", "IN")).toBe("+919876543210");
  });

  it("lets a typed +code override the selected country", () => {
    expect(toE164("+44 7700 900123", "IN")).toBe("+447700900123");
  });

  it("handles other countries", () => {
    expect(toE164("050 123 4567", "AE")).toBe("+971501234567");
  });

  it("rejects numbers of the wrong length", () => {
    expect(toE164("12345", "IN")).toBeNull();
  });

  it("splits a stored number back for editing", () => {
    expect(splitE164("+919876543210", "IN")).toEqual({ country: "IN", national: "9876543210" });
    expect(splitE164(null, "IN")).toEqual({ country: "IN", national: "" });
  });
});

describe("redirect after an email link", () => {
  it("allows paths on this site", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
    expect(safeNextPath("/")).toBe("/");
  });

  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "evil", "", null, undefined])("sends %j home instead", (next) => {
    expect(safeNextPath(next)).toBe("/");
  });
});
