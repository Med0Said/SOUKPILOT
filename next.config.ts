import type { NextConfig } from "next";

/**
 * Static security headers for every route. The Content-Security-Policy is
 * per-request (nonce) and is set in src/proxy.ts.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // ADR-003 (docs/ARCHITECTURE.md): Cache Components disabled. Nearly every
  // page is per-tenant, per-user data; request-time rendering is simpler and
  // removes the risk of caching one tenant's data for another.
  cacheComponents: false,
  poweredByHeader: false,
  experimental: {
    // CSV catalog import accepts files up to 2 MB (+ multipart overhead).
    serverActions: { bodySizeLimit: "3mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
