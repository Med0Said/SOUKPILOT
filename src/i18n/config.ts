/**
 * Locale configuration. French is the only complete locale in the MVP.
 * Arabic ("ar", RTL) is planned: layouts use logical CSS properties
 * (ms-/me-/ps-/pe-, start/end) so `dir="rtl"` can be enabled once every
 * screen has been translated AND tested. Do not advertise Arabic before then.
 */
export const SUPPORTED_LOCALES = ["fr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

export function localeDirection(locale: string): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
