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
  }).format(new Date(iso));
}
