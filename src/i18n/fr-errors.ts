/**
 * Error-screen strings, in their own module so the root error page
 * (src/app/global-error.tsx, a separate client bundle) does not ship the
 * whole dictionary. fr.ts reuses them: one source of truth.
 */
export const frErrors = {
  appName: "SoukPilot",
  title: "Une erreur est survenue",
  body: "La page n'a pas pu être chargée. Vos données ne sont pas perdues : réessayez dans un instant.",
  retry: "Réessayer",
  reference: (digest: string) => `Réf. ${digest}`,
} as const;
