/**
 * Per-browser display preferences stored in plain cookies (not sensitive):
 * read on the server so the first render already has the right theme and
 * sidebar state (no flash, no inline script under the CSP).
 */
export const THEME_COOKIE = "sp_theme";
export const SIDEBAR_COOKIE = "sp_sidebar";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "system";
}

export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === "collapsed";
}

/** Cookie string for document.cookie (one year, whole site, Lax). */
export function preferenceCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
