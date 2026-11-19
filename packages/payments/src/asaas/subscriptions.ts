import { z } from "zod";
import { asaasRequest, type AsaasHttpOptions, type AsaasRequest } from "./http.ts";
import { asaasValueFromCents } from "./money.ts";
import {
  asaasCustomerListSchema,
  asaasCustomerSchema,
  asaasDeletedSchema,
  webLink,
} from "./schemas.ts";

/**
 * The plans' monthly fee, charged on SellBridge's own Asaas account. Read from docs.asaas.com and
 * checked in the sandbox (19/11/2026):
 * subscriptions https://docs.asaas.com/docs/assinaturas
 * update https://docs.asaas.com/reference/atualizar-assinatura-existente
 * recurring checkout https://docs.asaas.com/docs/checkout-com-assinatura-recorrente
 * subscription events https://docs.asaas.com/docs/eventos-para-assinaturas
 */

/** Asaas refuses a charge below R$ 5,00 (sandbox, 19/11/2026). */
export const ASAAS_MINIMUM_CHARGE_CENTS = 500;

export const asaasSubscriptionSchema = z.object({
  id: z.string().min(1),
  customer: z.string().min(1),
  /** `ACTIVE`, `INACTIVE` or `EXPIRED`; a deleted subscription reads `INACTIVE` with `deleted`. */
  status: z.string(),
  deleted: z.boolean().nullish(),
  value: z.number(),
  /** `YYYY-MM-DD` of the next charge Asaas will generate. */
  nextDueDate: z.string().nullish(),
  billingType: z.string().nullish(),
  externalReference: z.string().nullish(),
  /** The recurring checkout that created it, when it came from one. */
  checkoutSession: z.string().nullish(),
});
export type AsaasSubscription = z.infer<typeof asaasSubscriptionSchema>;

export const asaasSubscriptionChargeSchema = z.object({
  id: z.string().min(1),
  customer: z.string().nullish(),
  subscription: z.string().nullish(),
  status: z.string(),
  value: z.number(),
  billingType: z.string().nullish(),
  /** `YYYY-MM-DD`. */
  dueDate: z.string(),
  externalReference: z.string().nullish(),
  invoiceUrl: webLink.nullish(),
  deleted: z.boolean().nullish(),
});
export type AsaasSubscriptionCharge = z.infer<typeof asaasSubscriptionChargeSchema>;

const chargeListSchema = z.object({
  hasMore: z.boolean(),
  data: z.array(asaasSubscriptionChargeSchema),
});

const subscriptionListSchema = z.object({ data: z.array(asaasSubscriptionSchema) });

const checkoutSchema = z.object({ id: z.string().min(1), link: webLink });

/** Who pays the monthly fee, as Asaas registers the customer. */
export interface AsaasSubscriber {
  readonly name: string;
  /** Digits only. */
  readonly cpfCnpj: string;
  readonly email: string;
  /** The tenant id: the key for finding the customer again. */
  readonly externalReference: string;
}

/** The payer's data the checkout page shows already filled in; Asaas wants all of it or none. */
export interface AsaasCheckoutPayer {
  readonly name: string;
  readonly cpfCnpj: string;
  readonly email: string;
  /** Digits with area code. */
  readonly phone: string;
  readonly address: string;
  readonly addressNumber: string;
  readonly complement: string;
  readonly province: string;
  /** Digits only. */
  readonly postalCode: string;
  readonly city: string;
}

export interface AsaasRecurringCheckout {
  readonly itemName: string;
  readonly description: string;
  readonly valueCents: number;
  /** `YYYY-MM-DD` of the first charge. */
  readonly firstDueDate: string;
  readonly externalReference: string;
  readonly payer: AsaasCheckoutPayer | null;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export interface AsaasPixSubscription {
  readonly customerId: string;
  readonly valueCents: number;
  /** `YYYY-MM-DD` of the first charge. */
  readonly firstDueDate: string;
  readonly description: string;
  readonly externalReference: string;
}

export interface AsaasOneOffCharge {
  readonly customerId: string;
  readonly billingType: "PIX" | "CREDIT_CARD";
  readonly valueCents: number;
  /** `YYYY-MM-DD`. */
  readonly dueDate: string;
  readonly description: string;
  readonly externalReference: string;
  readonly successUrl: string;
}

/** The checkout link stays open this long; a later click opens a new one. */
const CHECKOUT_MINUTES_TO_EXPIRE = 60;

function checkoutBody(checkout: AsaasRecurringCheckout) {
  const { payer } = checkout;
  return {
    // Asaas offers recurrence only by card (sandbox, 19/11/2026).
    billingTypes: ["CREDIT_CARD"],
    chargeTypes: ["RECURRENT"],
    minutesToExpire: CHECKOUT_MINUTES_TO_EXPIRE,
    externalReference: checkout.externalReference,
    callback: {
      successUrl: checkout.successUrl,
      cancelUrl: checkout.cancelUrl,
      expiredUrl: checkout.cancelUrl,
    },
    items: [
      {
        name: checkout.itemName,
        description: checkout.description,
        quantity: 1,
        value: asaasValueFromCents(checkout.valueCents),
      },
    ],
    subscription: { cycle: "MONTHLY", nextDueDate: checkout.firstDueDate },
    ...(payer === null
      ? {}
      : {
          customerData: {
            name: payer.name,
            cpfCnpj: payer.cpfCnpj,
            email: payer.email,
            phone: payer.phone,
            address: payer.address,
            addressNumber: payer.addressNumber,
            complement: payer.complement,
            province: payer.province,
            postalCode: payer.postalCode,
            city: payer.city,
          },
        }),
  };
}

function subscriptionPath(subscriptionId: string, suffix = ""): string {
  return `/subscriptions/${encodeURIComponent(subscriptionId)}${suffix}`;
}

type PlatformCall = <Result>(request: AsaasRequest<Result>) => Promise<Result>;

function subscriberCalls(call: PlatformCall) {
  return {
    async findSubscriber(externalReference: string): Promise<string | null> {
      const query = new URLSearchParams({ externalReference, limit: "1" }).toString();
      const list = await call({ path: `/customers?${query}`, schema: asaasCustomerListSchema });
      return list.data[0]?.id ?? null;
    },

    /** Asaas e-mails the subscriber each charge and its reminders (notifications left on). */
    async createSubscriber(subscriber: AsaasSubscriber): Promise<string> {
      const created = await call({
        path: "/customers",
        method: "POST",
        body: { ...subscriber, notificationDisabled: false },
        schema: asaasCustomerSchema,
      });
      return created.id;
    },

    /** Removes the customer and, with it, its subscriptions and open charges (account deletion). */
    async deleteSubscriber(customerId: string): Promise<boolean> {
      const result = await call({
        path: `/customers/${encodeURIComponent(customerId)}`,
        method: "DELETE",
        schema: asaasDeletedSchema,
      });
      return result.deleted;
    },
  };
}

function subscriptionCalls(call: PlatformCall) {
  return {
    async createPixSubscription(subscription: AsaasPixSubscription): Promise<AsaasSubscription> {
      return call({
        path: "/subscriptions",
        method: "POST",
        body: {
          customer: subscription.customerId,
          billingType: "PIX",
          cycle: "MONTHLY",
          value: asaasValueFromCents(subscription.valueCents),
          nextDueDate: subscription.firstDueDate,
          description: subscription.description,
          externalReference: subscription.externalReference,
        },
        schema: asaasSubscriptionSchema,
      });
    },

    async getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
      return call({ path: subscriptionPath(subscriptionId), schema: asaasSubscriptionSchema });
    },

    async findSubscriptionsOfCustomer(customerId: string): Promise<AsaasSubscription[]> {
      const query = new URLSearchParams({ customer: customerId, limit: "100" }).toString();
      const list = await call({ path: `/subscriptions?${query}`, schema: subscriptionListSchema });
      return list.data;
    },

    /** The subscription's charges, newest first; Asaas generates them ahead of each due date. */
    async listSubscriptionCharges(subscriptionId: string): Promise<AsaasSubscriptionCharge[]> {
      const list = await call({
        path: subscriptionPath(subscriptionId, "/payments?limit=100"),
        schema: chargeListSchema,
      });
      return list.data;
    },
  };
}

/** Changes to a live subscription: price, payment method and its end. */
function subscriptionChangeCalls(call: PlatformCall) {
  return {
    /**
     * The new monthly value from the next charge on, including one Asaas already generated and
     * nobody paid yet (`updatePendingPayments`).
     */
    async changeSubscriptionValue(
      subscriptionId: string,
      change: { valueCents: number; description: string },
    ): Promise<AsaasSubscription> {
      return call({
        path: subscriptionPath(subscriptionId),
        method: "PUT",
        body: {
          value: asaasValueFromCents(change.valueCents),
          description: change.description,
          updatePendingPayments: true,
        },
        schema: asaasSubscriptionSchema,
      });
    },

    /** From card to Pix on the same subscription, the charge already generated included. */
    async switchSubscriptionToPix(subscriptionId: string): Promise<AsaasSubscription> {
      return call({
        path: subscriptionPath(subscriptionId),
        method: "PUT",
        body: { billingType: "PIX", updatePendingPayments: true },
        schema: asaasSubscriptionSchema,
      });
    },

    /** Ends the recurrence and removes its unpaid charges; money already paid stays paid. */
    async deleteSubscription(subscriptionId: string): Promise<boolean> {
      const result = await call({
        path: subscriptionPath(subscriptionId),
        method: "DELETE",
        schema: asaasDeletedSchema,
      });
      return result.deleted;
    },
  };
}

function chargeCalls(call: PlatformCall) {
  return {
    async createRecurringCheckout(checkout: AsaasRecurringCheckout) {
      const created = await call({
        path: "/checkouts",
        method: "POST",
        body: checkoutBody(checkout),
        schema: checkoutSchema,
      });
      return { checkoutId: created.id, url: created.link };
    },

    /** Closes a checkout link nobody paid, so it cannot open a second subscription later. */
    async cancelCheckout(checkoutId: string): Promise<void> {
      await call({
        path: `/checkouts/${encodeURIComponent(checkoutId)}/cancel`,
        method: "POST",
        schema: z.object({ status: z.string() }),
      });
    },

    async createOneOffCharge(charge: AsaasOneOffCharge): Promise<AsaasSubscriptionCharge> {
      return call({
        path: "/payments",
        method: "POST",
        body: {
          customer: charge.customerId,
          billingType: charge.billingType,
          value: asaasValueFromCents(charge.valueCents),
          dueDate: charge.dueDate,
          description: charge.description,
          externalReference: charge.externalReference,
          callback: { successUrl: charge.successUrl, autoRedirect: true },
        },
        schema: asaasSubscriptionChargeSchema,
      });
    },

    async getCharge(chargeId: string): Promise<AsaasSubscriptionCharge> {
      return call({
        path: `/payments/${encodeURIComponent(chargeId)}`,
        schema: asaasSubscriptionChargeSchema,
      });
    },

    /** Removes an unpaid charge. Removing never refunds money already paid. */
    async deleteCharge(chargeId: string): Promise<boolean> {
      const result = await call({
        path: `/payments/${encodeURIComponent(chargeId)}`,
        method: "DELETE",
        schema: asaasDeletedSchema,
      });
      return result.deleted;
    },
  };
}

/** Calls for the plans' monthly fee, made with SellBridge's own key. */
export function createAsaasBillingClient(http: AsaasHttpOptions, apiKey: string) {
  const call: PlatformCall = async (request) => asaasRequest(http, { ...request, apiKey });
  return {
    ...subscriberCalls(call),
    ...subscriptionCalls(call),
    ...subscriptionChangeCalls(call),
    ...chargeCalls(call),
  };
}

export type AsaasBillingClient = ReturnType<typeof createAsaasBillingClient>;
