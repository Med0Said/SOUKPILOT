import { z } from "zod";

/**
 * Server-side input validation for Milestone 1 forms. The database repeats
 * the essential checks (constraints / function guards); these schemas exist
 * to give precise French messages before hitting the database.
 */

export const emailSchema = z
  .string({ error: "Adresse e-mail obligatoire." })
  .trim()
  .toLowerCase()
  .max(254, "Adresse e-mail trop longue.")
  .pipe(z.email({ error: "Adresse e-mail invalide." }));

/** Mirrors supabase/config.toml: min 10 chars, letters and digits. 72 = bcrypt limit. */
export const newPasswordSchema = z
  .string({ error: "Mot de passe obligatoire." })
  .min(10, "Au moins 10 caractères.")
  .max(72, "72 caractères maximum.")
  .regex(/\p{L}/u, "Le mot de passe doit contenir au moins une lettre.")
  .regex(/\d/, "Le mot de passe doit contenir au moins un chiffre.");

const fullNameSchema = z
  .string()
  .trim()
  .max(120, "120 caractères maximum.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Mot de passe obligatoire.").max(72, "72 caractères maximum."),
});

export const signUpSchema = z.object({
  fullName: fullNameSchema.min(2, "Au moins 2 caractères."),
  email: emailSchema,
  password: newPasswordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Les mots de passe ne correspondent pas.",
  });

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-TN", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1, "Fuseau horaire obligatoire.")
  .max(64)
  .refine(isValidTimeZone, "Fuseau horaire invalide.");

/** Short list offered in the UI; any valid IANA zone is accepted server-side. */
export const COMMON_TIME_ZONES = ["Africa/Tunis", "Africa/Algiers", "Africa/Tripoli", "Europe/Paris"] as const;

const organizationNameSchema = z
  .string()
  .trim()
  .min(2, "Au moins 2 caractères.")
  .max(120, "120 caractères maximum.");

export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
  locationName: z.string().trim().min(1, "Champ obligatoire.").max(80, "80 caractères maximum."),
  timezone: timeZoneSchema,
});

export const updateOrganizationSchema = z.object({
  organizationId: z.uuid(),
  name: organizationNameSchema,
  timezone: timeZoneSchema,
});

/**
 * Phone numbers are stored as user-entered text: Tunisian numbers are usually
 * 8 digits (optionally +216), but foreign suppliers/customers exist, so only
 * the character set and length are enforced.
 */
export const phoneSchema = z
  .string()
  .trim()
  .max(32, "32 caractères maximum.")
  .refine((v) => v === "" || /^\+?[0-9 ().-]{4,31}$/.test(v), "Numéro de téléphone invalide.")
  .transform((v) => (v === "" ? null : v));

export const profileSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
});

export const invitationSchema = z.object({
  organizationId: z.uuid(),
  email: emailSchema,
  role: z.enum(["manager", "cashier"], { error: "Rôle invalide." }),
});

export const memberRoleSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(["owner", "manager", "cashier"], { error: "Rôle invalide." }),
});

export const memberRefSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid(),
});

export const invitationRefSchema = z.object({
  invitationId: z.uuid(),
});

/** Turns FormData into a plain object of string values (files are ignored). */
export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  }
  return out;
}

export type FieldErrors = Record<string, string>;

export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
