/**
 * Maps stable error keys raised by database functions (see migrations) and
 * Supabase Auth error codes to French, user-facing messages.
 * Unknown errors get a generic message; details are logged server-side only.
 */
const DB_ERROR_MESSAGES: Record<string, string> = {
  auth_required: "Votre session a expiré. Reconnectez-vous.",
  forbidden: "Vous n'avez pas l'autorisation d'effectuer cette action.",
  invalid_name: "Le nom doit contenir entre 2 et 120 caractères.",
  invalid_location_name: "Le nom de la boutique doit contenir entre 1 et 80 caractères.",
  invalid_timezone: "Fuseau horaire invalide.",
  organization_limit_reached: "Nombre maximal d'organisations atteint pour ce compte. Contactez le support.",
  cannot_change_own_role: "Vous ne pouvez pas modifier votre propre rôle.",
  invalid_role: "Rôle invalide.",
  member_not_found: "Membre introuvable.",
  last_owner: "L'organisation doit garder au moins un propriétaire. Nommez d'abord un autre propriétaire.",
  invalid_email: "Adresse e-mail invalide.",
  already_member: "Cette personne est déjà membre de l'organisation.",
  invitation_exists: "Une invitation est déjà en attente pour cette adresse.",
  invitation_not_found: "Invitation introuvable.",
  invitation_not_pending: "Cette invitation a déjà été traitée.",
  invitation_expired: "Cette invitation a expiré. Demandez-en une nouvelle.",
  email_not_confirmed: "Confirmez d'abord votre adresse e-mail.",
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou mot de passe incorrect.",
  email_not_confirmed: "Confirmez d'abord votre adresse e-mail (vérifiez votre boîte de réception).",
  weak_password: "Mot de passe trop faible : au moins 10 caractères, avec des lettres et des chiffres.",
  same_password: "Le nouveau mot de passe doit être différent de l'ancien.",
  over_request_rate_limit: "Trop de tentatives. Patientez quelques minutes puis réessayez.",
  over_email_send_rate_limit: "Trop d'e-mails envoyés. Patientez quelques minutes puis réessayez.",
  reauthentication_needed: "Pour des raisons de sécurité, reconnectez-vous puis réessayez.",
  signup_disabled: "Les inscriptions sont temporairement fermées.",
  otp_expired: "Ce lien a expiré. Demandez un nouveau lien.",
};

export const GENERIC_ERROR = "Une erreur inattendue est survenue. Réessayez dans un instant.";

export function messageForDbError(error: { message?: string } | null | undefined): string {
  const key = error?.message?.trim();
  return (key && DB_ERROR_MESSAGES[key]) || GENERIC_ERROR;
}

export function messageForAuthError(error: { code?: string } | null | undefined): string {
  const code = error?.code;
  return (code && AUTH_ERROR_MESSAGES[code]) || GENERIC_ERROR;
}

export function isKnownDbError(error: { message?: string } | null | undefined): boolean {
  const key = error?.message?.trim();
  return Boolean(key && key in DB_ERROR_MESSAGES);
}
