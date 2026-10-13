/**
 * Per-request Content-Security-Policy with a nonce (Next.js attaches the
 * nonce to its own scripts when it finds it in the request's CSP header).
 * Pages must be rendered at request time — see src/app/layout.tsx.
 */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildCsp(
  nonce: string,
  options: { isDev: boolean; supabaseUrl: string; httpsSite: boolean },
): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${options.supabaseUrl}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only on HTTPS deployments: on plain-http localhost it would break asset loading.
    ...(options.httpsSite ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}
