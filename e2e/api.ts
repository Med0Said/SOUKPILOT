import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TestAccount } from "./helpers";

/**
 * A Supabase client signed in as a test account, through the same public API
 * and RLS as the app. Used to seed volume (hundreds of sales) quickly by
 * calling the app's own SQL functions; never bypasses a business rule.
 */
export async function apiAs(account: TestAccount): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see .env.local)");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error) throw new Error(`API sign-in failed: ${error.message}`);
  return client;
}

/** Throws with the database error key instead of silently returning null data. */
export async function rpc<T = unknown>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}
