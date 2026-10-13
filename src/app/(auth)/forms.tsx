"use client";

import Link from "next/link";
import { useActionState } from "react";
import { TextField } from "@/components/ui/field";
import { ActionMessage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/actions";
import { fr } from "@/i18n/fr";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "./actions";

const t = fr.auth;

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, initialActionState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <ActionMessage state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <TextField
        id="email"
        type="email"
        label={t.email}
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <TextField
        id="password"
        type="password"
        label={t.password}
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton className="w-full">{t.loginButton}</SubmitButton>
      <div className="flex flex-col gap-2 text-sm">
        <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
          {t.forgotPassword}
        </Link>
        <p className="text-muted">
          {t.noAccount}{" "}
          <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
            {t.signupLink}
          </Link>
        </p>
      </div>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialActionState);
  if (state.status === "success") {
    return (
      <div className="space-y-3" role="status">
        <h2 className="text-lg font-semibold">{t.checkEmailTitle}</h2>
        <p className="text-sm text-muted">{state.message}</p>
        <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          {t.backToLogin}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <ActionMessage state={state} />
      <TextField
        id="fullName"
        label={t.fullName}
        autoComplete="name"
        required
        defaultValue={state.values?.fullName}
        error={state.fieldErrors?.fullName}
      />
      <TextField
        id="email"
        type="email"
        label={t.email}
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <TextField
        id="password"
        type="password"
        label={t.password}
        autoComplete="new-password"
        hint={t.passwordHint}
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton className="w-full">{t.signupButton}</SubmitButton>
      <p className="text-sm text-muted">
        {t.haveAccount}{" "}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          {t.loginLink}
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialActionState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <ActionMessage state={state} />
      <TextField
        id="email"
        type="email"
        label={t.email}
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton className="w-full">{t.forgotButton}</SubmitButton>
      <Link href="/login" className="block text-sm text-primary underline-offset-4 hover:underline">
        {t.backToLogin}
      </Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, initialActionState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <ActionMessage state={state} />
      <TextField
        id="password"
        type="password"
        label={t.password}
        autoComplete="new-password"
        hint={t.passwordHint}
        required
        error={state.fieldErrors?.password}
      />
      <TextField
        id="confirmPassword"
        type="password"
        label={t.confirmPassword}
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton className="w-full">{t.resetButton}</SubmitButton>
    </form>
  );
}
