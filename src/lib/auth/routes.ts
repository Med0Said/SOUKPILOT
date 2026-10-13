/** Route prefixes that require a signed-in user. */
const PROTECTED_PREFIXES = ["/app", "/onboarding", "/invitations", "/reset-password"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const DEFAULT_AFTER_LOGIN = "/app";

/**
 * Sanitizes a post-login redirect target to prevent open redirects:
 * only same-origin absolute paths are allowed.
 */
export function safeNextPath(value: unknown, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Reject control characters and backslashes, which some browsers normalise to "/".
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://soukpilot.invalid");
    if (url.origin !== "http://soukpilot.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
