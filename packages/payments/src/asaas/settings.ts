import { z } from "zod";
import { ASAAS_PRODUCTION_API_URL } from "./http.ts";
import { ASAAS_WEBHOOK_TOKEN_MAX_LENGTH, ASAAS_WEBHOOK_TOKEN_MIN_LENGTH } from "./webhook.ts";

export interface AsaasSettings {
  readonly apiUrl: string;
  /** SellBridge's own key: opens supplier accounts and turns their protection on. */
  readonly apiKey: string;
  /** SellBridge's wallet: its fee arrives there through each charge's split. */
  readonly walletId: string;
  /** Sent back by Asaas in the `asaas-access-token` header of every notice. */
  readonly webhookToken: string;
}

/**
 * SellBridge's Asaas account, as the web app and the worker read it from their environment.
 * Protected payments are off until the three keys are set.
 */
export const asaasEnvironmentFields = {
  /** Asaas's API; the sandbox (https://api-sandbox.asaas.com/v3) only outside production. */
  ASAAS_API_URL: z.url().default(ASAAS_PRODUCTION_API_URL),
  ASAAS_API_KEY: z.string().min(1).optional(),
  ASAAS_WALLET_ID: z.string().min(1).optional(),
  ASAAS_WEBHOOK_TOKEN: z
    .string()
    .min(ASAAS_WEBHOOK_TOKEN_MIN_LENGTH)
    .max(ASAAS_WEBHOOK_TOKEN_MAX_LENGTH)
    .regex(/^\S+$/, "não pode ter espaços")
    .optional(),
};

export interface AsaasEnvironment {
  ASAAS_API_URL: string;
  ASAAS_API_KEY?: string | undefined;
  ASAAS_WALLET_ID?: string | undefined;
  ASAAS_WEBHOOK_TOKEN?: string | undefined;
}

/**
 * Production talks to Asaas itself, never to the sandbox or a stand-in: nothing on SellBridge's
 * side tells a test payment from a real one.
 */
export function refuseAsaasStandInsInProduction(
  value: AsaasEnvironment,
  context: z.RefinementCtx,
): void {
  if (value.ASAAS_API_URL.replace(/\/+$/, "") === ASAAS_PRODUCTION_API_URL) {
    return;
  }
  context.addIssue({
    code: "custom",
    path: ["ASAAS_API_URL"],
    message: `deve ser ${ASAAS_PRODUCTION_API_URL} em produção`,
  });
}

/** The account's settings, or null while any key is missing (the feature is off). */
export function asaasSettingsFrom(environment: AsaasEnvironment): AsaasSettings | null {
  const apiKey = environment.ASAAS_API_KEY;
  const walletId = environment.ASAAS_WALLET_ID;
  const webhookToken = environment.ASAAS_WEBHOOK_TOKEN;
  if (apiKey == null || walletId == null || webhookToken == null) {
    return null;
  }
  return {
    apiUrl: environment.ASAAS_API_URL.replace(/\/+$/, ""),
    apiKey,
    walletId,
    webhookToken,
  };
}
