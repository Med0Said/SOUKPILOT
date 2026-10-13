import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/routes";
import { logger } from "@/lib/logger";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Landing point for links in Supabase emails (signup confirmation, password
 * recovery). Supports the token_hash flow (our templates; works when the link
 * is opened on another device) and the PKCE `code` flow (default templates).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/app");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");

  const supabase = await createSupabaseServerClient();
  let failed = true;

  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) logger.warn("auth.verify_otp_failed", { code: error.code, type });
    failed = Boolean(error);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) logger.warn("auth.exchange_code_failed", { code: error.code });
    failed = Boolean(error);
  }

  const target = request.nextUrl.clone();
  target.search = "";
  if (failed) {
    target.pathname = "/login";
    target.searchParams.set("error", "link");
  } else {
    const resolved = new URL(next, request.nextUrl.origin);
    target.pathname = resolved.pathname;
    target.search = resolved.search;
  }
  return NextResponse.redirect(target);
}
