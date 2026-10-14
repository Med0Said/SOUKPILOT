/**
 * Display formatting for Tunisian users. Dates are always rendered in the
 * ORGANIZATION's timezone (not the server's or the browser's), so a sale
 * at 23:30 in Tunis is not shown on the next day by a UTC server.
 */
export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    // CLDR's fr-TN default is a 12-hour clock ("01:00 PM"); shops use 24 h.
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** Spreadsheet-friendly, sortable local date: "2026-03-10". */
export function formatIsoDate(iso: string, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Spreadsheet-friendly, sortable local date and time: "2026-03-10 13:05". */
export function formatIsoDateTime(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * A calendar day "YYYY-MM-DD" (already local to the organization) for
 * display: "10/03/2026", or "10/03" when short. No time-zone shift.
 */
export function formatCalendarDay(day: string, short = false): string {
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    ...(short ? {} : { year: "numeric" }),
  }).format(new Date(`${day.slice(0, 10)}T12:00:00Z`));
}
