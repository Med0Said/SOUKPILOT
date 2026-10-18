/**
 * Short list offered in the UI; any valid IANA zone is accepted server-side.
 * Zod-free on purpose: client forms import it without shipping the validator.
 */
export const COMMON_TIME_ZONES = ["Africa/Tunis", "Africa/Algiers", "Africa/Tripoli", "Europe/Paris"] as const;
