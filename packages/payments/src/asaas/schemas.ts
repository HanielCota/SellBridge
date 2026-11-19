import { z } from "zod";

/**
 * Asaas answers, read from docs.asaas.com (15/11/2026). Objects keep only the fields SellBridge
 * uses: Asaas adds fields over time and an unknown one must never fail a read.
 */

const WEB_PROTOCOLS = new Set(["http:", "https:"]);

/** A link Asaas sends to open in the browser; any other scheme (javascript:, data:) is dropped. */
const webLink = z
  .string()
  .transform((link) =>
    URL.canParse(link) && WEB_PROTOCOLS.has(new URL(link).protocol) ? link : null,
  );

export const asaasErrorResponseSchema = z.object({
  errors: z.array(z.object({ code: z.string().optional(), description: z.string().optional() })),
});

export const asaasCreatedAccountSchema = z.object({
  id: z.string().min(1),
  walletId: z.string().min(1),
  /** Returned once, on creation; Asaas does not show it again. */
  apiKey: z.string().min(1).nullish(),
});

export const asaasEscrowSettingsSchema = z.object({
  enabled: z.boolean(),
  daysToExpire: z.number().int(),
  isFeePayer: z.boolean().nullish(),
});

export const asaasEscrowSchema = z.object({
  id: z.string().min(1),
  /** `ACTIVE` while held, `DONE` once ended. */
  status: z.string(),
  expirationDate: z.string().nullish(),
  finishDate: z.string().nullish(),
  /** CHARGEBACK, EXPIRED, INSUFFICIENT_BALANCE, PAYMENT_REFUNDED, REQUESTED_BY_CUSTOMER... */
  finishReason: z.string().nullish(),
});

const asaasRefundSchema = z.object({
  status: z.string(),
  value: z.number().nullish(),
});

const asaasChargebackSchema = z.object({ status: z.string().nullish() });

const asaasSplitSchema = z.object({
  walletId: z.string(),
  fixedValue: z.number().nullish(),
  status: z.string().nullish(),
});

export const asaasPaymentSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  value: z.number(),
  netValue: z.number().nullish(),
  billingType: z.string().nullish(),
  externalReference: z.string().nullish(),
  invoiceUrl: webLink.nullish(),
  dueDate: z.string().nullish(),
  paymentDate: z.string().nullish(),
  confirmedDate: z.string().nullish(),
  deleted: z.boolean().nullish(),
  escrow: asaasEscrowSchema.nullish(),
  refunds: z.array(asaasRefundSchema).nullish(),
  chargeback: asaasChargebackSchema.nullish(),
  split: z.array(asaasSplitSchema).nullish(),
});
export type AsaasPayment = z.infer<typeof asaasPaymentSchema>;

export const asaasPaymentListSchema = z.object({
  hasMore: z.boolean(),
  data: z.array(asaasPaymentSchema),
});

export const asaasCustomerSchema = z.object({ id: z.string().min(1) });
export const asaasCustomerListSchema = z.object({ data: z.array(asaasCustomerSchema) });

export const asaasDeletedSchema = z.object({ deleted: z.boolean(), id: z.string() });

export const asaasPendingDocumentListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      type: z.string().nullish(),
      /** The page where the account owner sends this document, when Asaas offers one. */
      onboardingUrl: webLink.nullish(),
    }),
  ),
});

export const asaasAccountStatusSchema = z.object({
  /** `APPROVED` once Asaas has approved the whole account. */
  general: z.string(),
  documentation: z.string().nullish(),
  commercialInfo: z.string().nullish(),
  bankAccountInfo: z.string().nullish(),
});
