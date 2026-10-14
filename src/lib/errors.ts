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
  rate_limited: "Trop de demandes en peu de temps. Réessayez dans une heure.",
  duplicate_sku: "Ce SKU est déjà utilisé par un autre article de la boutique.",
  duplicate_barcode: "Ce code-barres est déjà utilisé par un autre article de la boutique.",
  duplicate_variant_options: "Deux variantes ont la même combinaison d'options.",
  variant_options_mismatch: "Chaque variante doit avoir une valeur pour chaque option de l'article.",
  invalid_product: "Données de l'article invalides. Vérifiez les champs.",
  invalid_variant_count: "Un article doit avoir entre 1 et 200 variantes.",
  invalid_reference: "Catégorie ou fournisseur introuvable.",
  import_not_found: "Import introuvable. Recommencez l'import.",
  import_already_committed: "Cet import a déjà été enregistré.",
  import_expired: "Cet aperçu a expiré. Recommencez l'import.",
  import_invalid_payload: "Le fichier ne contient aucun article valide.",
  import_too_large: "Import trop volumineux (2000 articles et 5000 variantes au maximum).",
  import_product_exists:
    "Un article de l'import existe déjà dans la boutique (créé entre-temps ?). Recommencez l'aperçu.",
  insufficient_stock: "Stock insuffisant.",
  stock_not_tracked: "Le stock de cet article n'est pas suivi.",
  location_inactive: "Cet emplacement est inactif.",
  opening_already_recorded:
    "Un stock initial ou des mouvements existent déjà pour cet article à cet emplacement. Utilisez un ajustement.",
  invalid_lines: "Lignes invalides : vérifiez les articles et les quantités (nombres entiers).",
  duplicate_line: "Le même article apparaît deux fois.",
  reason_required: "Indiquez un motif (3 caractères minimum).",
  adjustment_not_found: "Ajustement introuvable.",
  adjustment_not_pending: "Cet ajustement a déjà été traité.",
  count_already_open: "Un inventaire est déjà en cours pour cet emplacement.",
  count_not_found: "Inventaire introuvable.",
  count_not_in_progress: "Cet inventaire n'est plus modifiable.",
  count_not_submitted: "Cet inventaire n'est pas en attente de validation.",
  count_empty: "Comptez au moins un article avant de soumettre.",
  same_location: "Choisissez deux emplacements différents.",
  invalid_parameter: "Requête invalide. Rechargez la page.",
  invalid_discount: "Remise invalide : elle ne peut pas dépasser le montant.",
  discount_not_allowed: "Remise supérieure au maximum autorisé pour votre rôle.",
  variant_inactive: "Article inactif : il ne peut pas être vendu.",
  sale_amount_too_large: "Montant de vente trop élevé.",
  invalid_payment: "Paiement invalide : vérifiez le mode et le montant.",
  payment_exceeds_balance: "Le paiement dépasse le montant restant dû.",
  customer_required_for_credit: "Pour une vente non soldée (crédit), choisissez un client.",
  sale_not_found: "Vente introuvable.",
  sale_not_draft: "Cette vente n'est plus un brouillon.",
  sale_not_finalized: "Cette vente n'est pas validée.",
  return_exceeds_sold: "Quantité retournée supérieure à la quantité vendue restante.",
  refund_exceeds_balance: "Le remboursement dépasse le montant dû au client.",
  sale_immutable: "Une vente validée ne peut pas être modifiée : utilisez un retour.",
  unit_cost_required: "Indiquez un prix d'achat pour chaque ligne.",
  supplier_inactive: "Ce fournisseur est inactif.",
  purchase_amount_too_large: "Montant de commande trop élevé.",
  purchase_order_not_found: "Bon de commande introuvable.",
  purchase_order_locked: "Ce bon de commande est déjà passé : il ne peut plus être modifié.",
  purchase_order_not_cancellable: "Impossible d'annuler : des marchandises ont déjà été reçues. Clôturez la commande.",
  purchase_order_not_open: "Ce bon de commande n'attend plus de réception.",
  receipt_exceeds_ordered: "Quantité reçue supérieure au reste à recevoir.",
  invalid_date: "Date invalide.",
};

/** Keys whose database `details` (e.g. the product name) is worth showing. */
const KEYS_WITH_DETAIL = new Set([
  "insufficient_stock",
  "stock_not_tracked",
  "opening_already_recorded",
  "variant_inactive",
  "return_exceeds_sold",
  "receipt_exceeds_ordered",
]);

/** Like messageForDbError, appending useful details (« T-shirt (S) — disponible : 2 »). */
export function messageWithDetail(error: { message?: string; code?: string; details?: string | null } | null | undefined): string {
  const base = messageForDbError(error);
  const key = error?.message?.trim();
  return key && KEYS_WITH_DETAIL.has(key) && error?.details ? `${base} ${error.details}` : base;
}

/** Unique / foreign-key constraint names (direct table writes) → messages. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  product_variants_org_sku_idx: DB_ERROR_MESSAGES.duplicate_sku,
  product_variants_org_barcode_idx: DB_ERROR_MESSAGES.duplicate_barcode,
  product_variants_product_options_idx: DB_ERROR_MESSAGES.duplicate_variant_options,
  categories_org_name_idx: "Une catégorie porte déjà ce nom.",
  suppliers_org_name_idx: "Un fournisseur porte déjà ce nom.",
  locations_organization_id_name_key: "Un emplacement porte déjà ce nom.",
  locations_organization_id_code_key: "Un emplacement utilise déjà ce code.",
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

function constraintOf(message: string | undefined): string | undefined {
  return message?.match(/constraint "([^"]+)"/)?.[1];
}

export function messageForDbError(error: { message?: string; code?: string } | null | undefined): string {
  const key = error?.message?.trim();
  if (key && DB_ERROR_MESSAGES[key]) return DB_ERROR_MESSAGES[key];
  const constraint = constraintOf(key);
  if (constraint && CONSTRAINT_MESSAGES[constraint]) return CONSTRAINT_MESSAGES[constraint];
  // Check / not-null violations on direct writes: input the form failed to catch.
  if (error?.code === "23514" || error?.code === "23502") return "Données invalides. Vérifiez les champs.";
  return GENERIC_ERROR;
}

export function messageForAuthError(error: { code?: string } | null | undefined): string {
  const code = error?.code;
  return (code && AUTH_ERROR_MESSAGES[code]) || GENERIC_ERROR;
}

export function isKnownDbError(error: { message?: string; code?: string } | null | undefined): boolean {
  return messageForDbError(error) !== GENERIC_ERROR;
}
