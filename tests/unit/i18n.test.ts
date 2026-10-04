import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dictionaryOf, makeT } from "@/i18n";

// Every t("…") / msg("…") text in the app must have a Hindi translation with the same {placeholders}.

const SRC = join(import.meta.dirname, "../../src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === "i18n" ? [] : files(p)) : /\.tsx?$/.test(f) ? [p] : [];
  });
const keys = new Map<string, string>();
for (const f of files(SRC)) {
  for (const m of readFileSync(f, "utf8").matchAll(/\b(?:t|msg)\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.set(JSON.parse(`"${m[1]}"`), f.replace(SRC, "src"));
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("Hindi", () => {
  const hi = dictionaryOf("hi")!;

  it("has every text in the app", () => {
    const missing = [...keys].filter(([k]) => !(k in hi)).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });

  it("keeps the same {placeholders}", () => {
    const wrong = [...keys.keys()].filter((k) => k in hi && placeholders(k).join() !== placeholders(hi[k]).join());
    expect(wrong).toEqual([]);
  });

  it("formats dates and money in Hindi", () => {
    const t = makeT("hi");
    expect(t.date("2026-10-03")).toBe("3 अक्टू॰ 2026");
    expect(t.money(150000)).toBe("₹1,50,000");
    expect(makeT("en")("{n} left", { n: 3 })).toBe("3 left");
  });
});
