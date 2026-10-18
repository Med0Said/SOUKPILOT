import "server-only";
import { logger } from "@/lib/logger";

/** Thrown when a read fails; the app's error screen shows its digest, the log has the details. */
export class QueryFailedError extends Error {
  constructor() {
    super("query_failed");
    this.name = "QueryFailedError";
  }
}

type DbError = { code?: string; message?: string };
/** Supabase responses are `{ data: T; error: null } | { data: null; error }`: keep the success side. */
type Success<R> = R extends { data: infer D; error: null } ? D : never;

/**
 * Data of a Supabase read, or a logged error. A failed read must never look
 * like "no row" (a false 404) or like an empty list or a zero balance.
 * `data: null` without an error (no matching row) is returned as is.
 */
export function must<R extends { data: unknown; error: DbError | null }>(result: R, event: string, fields: Record<string, unknown> = {}): Success<R> {
  if (result.error) {
    logger.error(event, { ...fields, code: result.error.code });
    throw new QueryFailedError();
  }
  return result.data as Success<R>;
}
