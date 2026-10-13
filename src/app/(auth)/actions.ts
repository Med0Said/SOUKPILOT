"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/auth/routes";
import { clearActiveOrganizationCookie } from "@/lib/auth/organization";
import { messageForAuthError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ActionState } from "@/lib/actions";
import {
  fieldErrorsFrom,
  forgotPasswordSchema,
  formDataToObject,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/lib/validation/schemas";
import { fr } from "@/i18n/fr";

/** Values echoed back to the form after an error. Never includes passwords. */
function safeEcho(raw: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw).filter(([key]) => key !== "password" && key !== "confirmPassword"),
  );
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values: safeEcho(raw) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (!error.code || !["invalid_credentials", "email_not_confirmed"].includes(error.code)) {
      logger.warn("auth.sign_in_failed", { code: error.code, status: error.status });
    }
    return { status: "error", message: messageForAuthError(error), values: safeEcho(raw) };
  }

  redirect(safeNextPath(raw.next));
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values: safeEcho(raw) };
  }

  const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/onboarding`,
    },
  });

  if (error) {
    logger.warn("auth.sign_up_failed", { code: error.code, status: error.status });
    return { status: "error", message: messageForAuthError(error), values: safeEcho(raw) };
  }

  // Same response whether or not the address already has an account
  // (Supabase obfuscates existing users when confirmations are enabled).
  return { status: "success", message: fr.auth.checkEmailBody };
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values: raw };
  }

  const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/reset-password`,
  });

  if (error && error.code?.startsWith("over_")) {
    return { status: "error", message: messageForAuthError(error), values: raw };
  }
  if (error) {
    logger.warn("auth.reset_request_failed", { code: error.code, status: error.status });
  }
  // Do not reveal whether the account exists.
  return { status: "success", message: fr.auth.forgotSent };
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    redirect("/login?next=/reset-password");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn("auth.password_update_failed", { code: error.code, status: error.status });
    return { status: "error", message: messageForAuthError(error) };
  }

  redirect("/app");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    logger.warn("auth.sign_out_failed", { code: error.code, status: error.status });
  }
  await clearActiveOrganizationCookie();
  redirect("/login");
}
