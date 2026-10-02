// Parsing for typed dates. Indian order (day first) is assumed:
//   02/10/2026  2/10/26  2-10  2.10.2026  02102026  2026-10-02  today  tomorrow

function iso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  const ok = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return ok ? date.toISOString().slice(0, 10) : null;
}

export function parseDateInput(text: string, today: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const [ty] = today.split("-").map(Number);
  const shift = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

  if (t === "today" || t === "t") return today;
  if (t === "tomorrow" || t === "tmrw") return shift(1);
  if (t === "yesterday") return shift(-1);

  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = t.match(/^(\d{1,2})[/\-. ](\d{1,2})(?:[/\-. ](\d{2}|\d{4}))?$/);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : ty;
    return iso(year, +m[2], +m[1]);
  }

  m = t.match(/^(\d{2})(\d{2})(\d{4}|\d{2})?$/); // 0210, 021026, 02102026
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : ty;
    return iso(year, +m[2], +m[1]);
  }
  return null;
}

/** 2026-10-02 → 02/10/2026 */
export function toDisplay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}
