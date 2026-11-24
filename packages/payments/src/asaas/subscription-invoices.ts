import { z } from "zod";
import { isAsaasError, type AsaasRequest } from "./http.ts";
import { asaasCustomerSchema } from "./schemas.ts";

/**
 * The service invoice (NFS-e) of the plans' monthly fee, issued by Asaas on SellBridge's own
 * account. Read from docs.asaas.com and checked in the sandbox (23/11/2026):
 * guide https://docs.asaas.com/docs/emitir-notas-fiscais-automaticamente-para-assinaturas
 * settings https://docs.asaas.com/reference/criar-configuracao-para-emissao-de-notas-fiscais
 * schedule https://docs.asaas.com/reference/agendar-nota-fiscal
 *
 * In the sandbox: POST on a subscription that already has settings replaces them (200); Asaas
 * refuses the settings while the customer lacks e-mail, street address or CEP; and a charge paid
 * before the settings existed gets no invoice from them, so it needs one scheduled by hand.
 */

/** Asaas lists the city's services (`GET /fiscalInfo/services`); without the list, the code. */
export type AsaasMunicipalService =
  | { readonly kind: "id"; readonly id: string; readonly name: string }
  | { readonly kind: "code"; readonly code: string; readonly name: string };

/** Rates in percent (2 means 2%), as the accountant gives them. */
export interface AsaasInvoiceTaxes {
  readonly retainIss: boolean;
  readonly issPercent: number;
  /** Withheld rates: zero when the buyer withholds nothing. */
  readonly pisPercent: number;
  readonly cofinsPercent: number;
  readonly csllPercent: number;
  readonly inssPercent: number;
  readonly irPercent: number;
  readonly nbsCode: string | null;
  /** Only outside Simples Nacional, with the two operation rates (Asaas, since 30/06/2026). */
  readonly pisCofinsTaxStatus: string | null;
  readonly operationPisPercent: number | null;
  readonly operationCofinsPercent: number | null;
}

export interface AsaasInvoiceService {
  readonly service: AsaasMunicipalService;
  readonly taxes: AsaasInvoiceTaxes;
}

/** What Asaas needs on the customer before it accepts invoice settings. */
export interface AsaasSubscriberContact {
  readonly email: string;
  readonly address: string;
  readonly addressNumber: string;
  readonly complement: string;
  readonly province: string;
  /** Digits only. */
  readonly postalCode: string;
}

export interface AsaasChargeInvoice {
  readonly chargeId: string;
  /** The charge's value in reais, as Asaas returned it. */
  readonly value: number;
  /** `YYYY-MM-DD`. */
  readonly effectiveDate: string;
  readonly description: string;
}

const invoiceSettingsSchema = z.object({
  municipalServiceId: z.string().nullish(),
  municipalServiceCode: z.string().nullish(),
  invoiceCreationPeriod: z.string().nullish(),
});
export type AsaasSubscriptionInvoiceSettings = z.infer<typeof invoiceSettingsSchema>;

const invoiceSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  payment: z.string().nullish(),
});
export type AsaasInvoice = z.infer<typeof invoiceSchema>;

const invoiceListSchema = z.object({ data: z.array(invoiceSchema) });

function serviceFields(service: AsaasMunicipalService) {
  // Asaas asks for the name even with the id (sandbox, 23/11/2026).
  if (service.kind === "id") {
    return { municipalServiceId: service.id, municipalServiceName: service.name };
  }
  return { municipalServiceCode: service.code, municipalServiceName: service.name };
}

function taxesBody(taxes: AsaasInvoiceTaxes) {
  return {
    retainIss: taxes.retainIss,
    iss: taxes.issPercent,
    pis: taxes.pisPercent,
    cofins: taxes.cofinsPercent,
    csll: taxes.csllPercent,
    inss: taxes.inssPercent,
    ir: taxes.irPercent,
    ...(taxes.nbsCode === null ? {} : { nbsCode: taxes.nbsCode }),
    ...(taxes.pisCofinsTaxStatus === null
      ? {}
      : {
          pisCofinsTaxStatus: taxes.pisCofinsTaxStatus,
          operationPis: taxes.operationPisPercent,
          operationCofins: taxes.operationCofinsPercent,
        }),
  };
}

/** The subscription's automatic invoice, issued once each charge's payment is confirmed. */
export function subscriptionInvoiceSettingsBody(service: AsaasInvoiceService, description: string) {
  return {
    ...serviceFields(service.service),
    effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION",
    observations: description,
    taxes: taxesBody(service.taxes),
  };
}

/** An invoice for a charge paid before the subscription had settings. */
export function chargeInvoiceBody(service: AsaasInvoiceService, invoice: AsaasChargeInvoice) {
  return {
    payment: invoice.chargeId,
    serviceDescription: invoice.description,
    observations: invoice.description,
    value: invoice.value,
    deductions: 0,
    effectiveDate: invoice.effectiveDate,
    ...serviceFields(service.service),
    taxes: taxesBody(service.taxes),
  };
}

type PlatformCall = <Result>(request: AsaasRequest<Result>) => Promise<Result>;

function settingsPath(subscriptionId: string): string {
  return `/subscriptions/${encodeURIComponent(subscriptionId)}/invoiceSettings`;
}

export function subscriptionInvoiceCalls(call: PlatformCall) {
  return {
    async updateSubscriberContact(
      customerId: string,
      contact: AsaasSubscriberContact,
    ): Promise<void> {
      await call({
        path: `/customers/${encodeURIComponent(customerId)}`,
        method: "PUT",
        body: contact,
        schema: asaasCustomerSchema,
      });
    },

    /** Null when the subscription has no invoice settings (Asaas answers 404). */
    async getSubscriptionInvoiceSettings(
      subscriptionId: string,
    ): Promise<AsaasSubscriptionInvoiceSettings | null> {
      try {
        return await call({ path: settingsPath(subscriptionId), schema: invoiceSettingsSchema });
      } catch (error) {
        if (isAsaasError(error) && error.status === 404) return null;
        throw error;
      }
    },

    /** Creates the settings, or replaces the ones the subscription has. */
    async saveSubscriptionInvoiceSettings(
      subscriptionId: string,
      settings: { service: AsaasInvoiceService; description: string },
    ): Promise<void> {
      await call({
        path: settingsPath(subscriptionId),
        method: "POST",
        body: subscriptionInvoiceSettingsBody(settings.service, settings.description),
        schema: invoiceSettingsSchema,
      });
    },

    async listSubscriptionInvoices(subscriptionId: string): Promise<AsaasInvoice[]> {
      const list = await call({
        path: `/subscriptions/${encodeURIComponent(subscriptionId)}/invoices?limit=100`,
        schema: invoiceListSchema,
      });
      return list.data;
    },

    async scheduleChargeInvoice(
      service: AsaasInvoiceService,
      invoice: AsaasChargeInvoice,
    ): Promise<AsaasInvoice> {
      return call({
        path: "/invoices",
        method: "POST",
        body: chargeInvoiceBody(service, invoice),
        schema: invoiceSchema,
      });
    },
  };
}
