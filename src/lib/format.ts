// Formatting and normalisation helpers. India is the default, but everything
// takes the clinic's currency / timezone so other regions slot in later.

/** Today's date (YYYY-MM-DD) in the clinic's timezone, not the server's. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function formatDate(isoDate: string): string {
  // Dates are plain calendar days; parse as UTC so they never shift by a day.
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** "Mon, 6 Oct" — for upcoming days, where the year is obvious. */
export function formatDay(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

export function formatMoney(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(Number(amount)) ? 0 : 2,
  }).format(Number(amount));
}

/** Free click-to-chat link: opens the physio's own WhatsApp with text filled in. */
export function whatsappLink(phone: string | null, text: string): string {
  const number = phone ? phone.replace(/\D/g, "") : "";
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
