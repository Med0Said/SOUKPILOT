"use server";

/**
 * Integration server actions. Order for every external call:
 * input validation → membership → database gate (switch on + quotas,
 * consume_integration_call) → provider call through the adapter
 * (timeouts, retries, cache). A provider failure never throws to the UI.
 */
import { revalidatePath } from "next/cache";
import { membershipFor } from "@/lib/auth/organization";
import { isKnownDbError, messageForDbError } from "@/lib/errors";
import { lookupBarcode, type BarcodeSuggestion } from "@/lib/integrations/barcode";
import { CURRENCIES, getTndRates, toTndMillimes, type Currency } from "@/lib/integrations/exchange-rates";
import { fakeFetcher } from "@/lib/integrations/fixtures";
import { isValidGtin, normalizeGtin } from "@/lib/integrations/gtin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IntegrationKey } from "@/lib/supabase/database.types";
import { logger } from "@/lib/logger";
import type { ActionState } from "@/lib/actions";
import { fr } from "@/i18n/fr";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS: readonly IntegrationKey[] = ["barcode_lookup", "exchange_rates"];

/** Asks the database whether this call may go out (switch + quotas). */
async function gate(organizationId: string, integration: IntegrationKey): Promise<"ok" | "disabled" | "rate_limited" | "forbidden"> {
  if (!UUID.test(organizationId) || !(await membershipFor(organizationId))) return "forbidden";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("consume_integration_call", { p_organization_id: organizationId, p_integration: integration });
  if (!error) return "ok";
  if (error.message.includes("integration_disabled")) return "disabled";
  if (error.message.includes("rate_limited")) return "rate_limited";
  if (!isKnownDbError(error)) logger.error("integration.gate_failed", { organizationId, integration, code: error.code });
  return "forbidden";
}

export async function setIntegrationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const integration = String(formData.get("integration") ?? "") as IntegrationKey;
  const enabled = formData.get("enabled") === "true";
  if (!UUID.test(organizationId) || !KEYS.includes(integration)) return { status: "error", message: messageForDbError({ message: "invalid_integration" }) };
  const context = await membershipFor(organizationId);
  if (!context || context.membership.role !== "owner") return { status: "error", message: messageForDbError({ message: "forbidden" }) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_integration_enabled", { p_organization_id: organizationId, p_integration: integration, p_enabled: enabled });
  if (error) {
    if (!isKnownDbError(error)) logger.error("integration.set_failed", { organizationId, integration, code: error.code });
    return { status: "error", message: messageForDbError(error) };
  }
  logger.info("integration.switched", { organizationId, userId: context.user.id, integration, enabled });
  revalidatePath("/app/settings/integrations");
  revalidatePath("/app/catalog", "layout");
  revalidatePath("/app/purchases", "layout");
  return { status: "success", message: fr.integrations.saved };
}

export type BarcodeLookupResult =
  | { status: "found"; suggestion: BarcodeSuggestion }
  | { status: "not_found" | "invalid" | "disabled" | "rate_limited" | "unavailable" };

export async function lookupBarcodeAction(organizationId: string, rawCode: string): Promise<BarcodeLookupResult> {
  const code = normalizeGtin(String(rawCode ?? "")).slice(0, 20);
  if (!isValidGtin(code)) return { status: "invalid" };
  const allowed = await gate(organizationId, "barcode_lookup");
  if (allowed === "disabled" || allowed === "forbidden") return { status: "disabled" };
  if (allowed === "rate_limited") return { status: "rate_limited" };
  try {
    const suggestion = await lookupBarcode(code, fakeFetcher());
    return suggestion ? { status: "found", suggestion } : { status: "not_found" };
  } catch (error) {
    logger.warn("integration.barcode_unavailable", { organizationId, reason: (error as Error).message });
    return { status: "unavailable" };
  }
}

export type ConversionResult =
  | { status: "ok"; millimes: number; date: string; tndPerUnit: number; currency: Currency; amount: number }
  | { status: "invalid" | "disabled" | "rate_limited" | "unavailable" };

export async function convertCurrencyAction(organizationId: string, rawAmount: string, rawCurrency: string): Promise<ConversionResult> {
  const amount = Number(String(rawAmount ?? "").replace(/\s/g, "").replace(",", "."));
  const currency = String(rawCurrency ?? "") as Currency;
  if (!(amount > 0 && amount <= 1e9) || !CURRENCIES.includes(currency)) return { status: "invalid" };
  const allowed = await gate(organizationId, "exchange_rates");
  if (allowed === "disabled" || allowed === "forbidden") return { status: "disabled" };
  if (allowed === "rate_limited") return { status: "rate_limited" };
  try {
    const rates = await getTndRates(fakeFetcher());
    return { status: "ok", millimes: toTndMillimes(amount, currency, rates), date: rates.date, tndPerUnit: rates.tndPerUnit[currency], currency, amount };
  } catch (error) {
    logger.warn("integration.rates_unavailable", { organizationId, reason: (error as Error).message });
    return { status: "unavailable" };
  }
}
