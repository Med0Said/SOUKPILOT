import "server-only";

/**
 * Outbound HTTP for integrations. Rules: server-side only (the browser never
 * talks to a provider and the CSP keeps connect-src to our own origins),
 * short timeouts, one retry on network errors and 5xx, a response size cap,
 * an identifying User-Agent, no cookies or credentials forwarded, and no
 * business data in URLs beyond what the integration needs (a barcode, a
 * currency code).
 */

export const USER_AGENT = "SoukPilot/0.1 (retail back-office; +https://github.com/Med0Said/SOUKPILOT)";

export class IntegrationError extends Error {
  constructor(
    readonly reason: "timeout" | "network" | "http" | "too_large" | "invalid_response",
    message: string,
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type JsonOptions = { timeoutMs?: number; retries?: number; maxBytes?: number; fetcher?: FetchLike };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url: string, options: JsonOptions = {}): Promise<{ status: number; body: unknown }> {
  const { timeoutMs = 4000, retries = 1, maxBytes = 512_000, fetcher = fetch } = options;
  let lastError: IntegrationError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(300 * attempt);
    try {
      const response = await fetcher(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
        credentials: "omit",
        redirect: "follow",
        cache: "no-store",
      });
      if (response.status >= 500) {
        lastError = new IntegrationError("http", `HTTP ${response.status}`);
        continue;
      }
      const text = await response.text();
      if (text.length > maxBytes) throw new IntegrationError("too_large", `${text.length} bytes`);
      try {
        return { status: response.status, body: JSON.parse(text) };
      } catch {
        throw new IntegrationError("invalid_response", "not JSON");
      }
    } catch (error) {
      if (error instanceof IntegrationError) {
        if (error.reason !== "http") throw error;
        lastError = error;
      } else if ((error as Error).name === "TimeoutError" || (error as Error).name === "AbortError") {
        lastError = new IntegrationError("timeout", `after ${timeoutMs} ms`);
      } else {
        lastError = new IntegrationError("network", (error as Error).message);
      }
    }
  }
  throw lastError ?? new IntegrationError("network", "unknown");
}

/** Small in-memory TTL cache (per server instance; a miss only costs a call). */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();
  constructor(private readonly maxEntries = 500) {}

  get(key: string, now = Date.now()): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number, now = Date.now()): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expires: now + ttlMs });
  }
}

/** Last outcome per provider, shown on the Intégrations page (per instance). */
export type ProviderStatus = { lastSuccessAt: string | null; lastFailureAt: string | null; lastFailure: string | null };
const statuses = new Map<string, ProviderStatus>();

export function recordOutcome(provider: string, error?: IntegrationError | null): void {
  const current = statuses.get(provider) ?? { lastSuccessAt: null, lastFailureAt: null, lastFailure: null };
  const now = new Date().toISOString();
  statuses.set(
    provider,
    error ? { ...current, lastFailureAt: now, lastFailure: `${error.reason}: ${error.message}`.slice(0, 120) } : { ...current, lastSuccessAt: now },
  );
}

export function providerStatus(provider: string): ProviderStatus {
  return statuses.get(provider) ?? { lastSuccessAt: null, lastFailureAt: null, lastFailure: null };
}
