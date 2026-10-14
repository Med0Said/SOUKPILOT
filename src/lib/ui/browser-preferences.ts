import { THEME_COOKIE, preferenceCookie, type Theme } from "./preferences";

/** Browser-side effects for display preferences (called from event handlers). */
export function savePreference(name: string, value: string): void {
  document.cookie = preferenceCookie(name, value);
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  savePreference(THEME_COOKIE, theme);
}
