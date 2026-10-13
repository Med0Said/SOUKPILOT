import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "./csp";

describe("CSP", () => {
  it("creates unpredictable base64 nonces", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });

  it("allows scripts only by nonce in production, never unsafe-inline", () => {
    const csp = buildCsp("abc", { isDev: false, supabaseUrl: "https://x.supabase.co", httpsSite: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://x.supabase.co");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("adds unsafe-eval only in development and skips the https upgrade on http sites", () => {
    const csp = buildCsp("abc", { isDev: true, supabaseUrl: "http://127.0.0.1:54321", httpsSite: false });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
