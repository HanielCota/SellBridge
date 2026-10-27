import { z } from "zod";
import { freeText, MAX_PAGE, searchQuery } from "./common.ts";
import { refuseContactDetails, refuseContactLink } from "./contact-guard.ts";
import { optionalParameter, withFallback } from "./fallback.ts";
import { isoDateSchema, PERIOD_PRESETS } from "./period.ts";

/**
 * Statuses the supplier or reseller reach by hand, in the order a parcel moves through them.
 * The repository enforces it: a manual update only moves to `FULFILLMENT_NEXT` or cancels.
 */
export const MANUAL_FULFILLMENT_STATUSES = [
  "forwarded",
  "accepted",
  "picking",
  "ready",
  "shipped",
  "delivered",
  "cancelled",
] as const;
/** Only the marketplace's tracking reports these: the carrier failed, or the parcel came back. */
export const MARKETPLACE_ONLY_STATUSES = ["not_delivered", "returned"] as const;
export const FULFILLMENT_STATUSES = [
  ...MANUAL_FULFILLMENT_STATUSES,
  ...MARKETPLACE_ONLY_STATUSES,
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];
/** What a marketplace shipment says about the parcel once it left the supplier. */
export type MarketplaceTrackingStatus = Extract<
  FulfillmentStatus,
  "shipped" | "delivered" | "not_delivered" | "returned" | "cancelled"
>;
/** Settled parcels: delivered, back with the seller or cancelled. Nothing moves them again. */
export const SETTLED_FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = [
  "delivered",
  "returned",
  "cancelled",
];
/** The parcel left the supplier: it can no longer be cancelled from here. */
export const DISPATCHED_FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = [
  "shipped",
  "delivered",
  "not_delivered",
  "returned",
];
/** Who a shipment history step is credited to, as `shipment_events.actor` stores it. */
export const SHIPMENT_ACTORS = {
  reseller: "Revendedor",
  supplier: "Fornecedor",
  marketplace: "Mercado Livre",
  /** The automatic forward (item 21.b), done for the reseller when the order is paid. */
  sellbridge: "SellBridge",
} as const;
/**
 * A tracking code fixed after the parcel was sent is a step everyone must see ("Código corrigido
 * de X para Y"), never a chat message, even though it keeps the status and carries a note.
 */
const TRACKING_CODE_CORRECTION_PREFIX = "Código corrigido de ";

export function trackingCodeCorrectionNote(previous: string, next: string, note: string): string {
  const correction = `${TRACKING_CODE_CORRECTION_PREFIX}${previous} para ${next}`;
  return note.trim() === "" ? correction : `${correction} · ${note.trim()}`;
}

export function isTrackingCodeCorrection(note: string): boolean {
  return note.startsWith(TRACKING_CODE_CORRECTION_PREFIX);
}
/** Who moves a shipment by hand: the reseller in the app, or the supplier through its link. */
export type ShipmentOperator = Exclude<keyof typeof SHIPMENT_ACTORS, "marketplace" | "sellbridge">;
/** Why the supplier link stops at dispatch; said by the server and shown on the link alike. */
export const DELIVERY_CONFIRMED_BY =
  "Quem confirma a entrega é a loja que fez a venda, ou o rastreio do Mercado Livre quando a venda é de lá.";
/**
 * Events one parcel keeps, steps and messages alike: the supplier link can be called by anyone
 * holding it, and without a ceiling a script could bloat the history every order page loads.
 */
export const SHIPMENT_EVENTS_LIMIT = 100;
export const SHIPMENT_EVENTS_FULL = `Este pedido chegou ao limite de ${SHIPMENT_EVENTS_LIMIT} registros e não recebe mais mensagens. Se precisar combinar algo, fale com o suporte.`;
export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  forwarded: "Aguardando fornecedor",
  accepted: "Aceito",
  picking: "Em separação",
  ready: "Pronto para envio",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  not_delivered: "Não entregue",
  returned: "Devolvido",
};
export const FULFILLMENT_NEXT: Record<FulfillmentStatus, FulfillmentStatus | null> = {
  forwarded: "accepted",
  accepted: "picking",
  picking: "ready",
  ready: "shipped",
  shipped: "delivered",
  delivered: null,
  cancelled: null,
  not_delivered: null,
  returned: null,
};
export const deliveryAddressSchema = z.object({
  recipient: freeText().trim().min(2).max(120).superRefine(refuseContactDetails),
  street: freeText().trim().min(2).max(200).superRefine(refuseContactDetails),
  number: freeText().trim().min(1).max(30).superRefine(refuseContactDetails),
  complement: freeText().trim().max(150).superRefine(refuseContactDetails).default(""),
  neighborhood: freeText().trim().min(2).max(100).superRefine(refuseContactDetails),
  city: freeText().trim().min(2).max(100).superRefine(refuseContactDetails),
  state: freeText()
    .trim()
    .regex(/^[A-Z]{2}$/, "Informe a UF com duas letras"),
  postalCode: freeText()
    .trim()
    .regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
});
export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;
export const forwardOrderSchema = z.object({
  orderId: z.uuid(),
  address: deliveryAddressSchema,
  notes: freeText().trim().max(1000).superRefine(refuseContactDetails).default(""),
});
export const shipmentUpdateSchema = z
  .object({
    shipmentId: z.uuid(),
    status: z.enum(FULFILLMENT_STATUSES),
    carrier: freeText().trim().max(100).superRefine(refuseContactDetails).default(""),
    trackingCode: freeText()
      .trim()
      .max(100)
      .regex(/^[A-Za-z0-9 .-]*$/, "Use só letras, números, pontos e hífens no código de rastreio")
      .superRefine(refuseContactDetails)
      .default(""),
    trackingUrl: z
      .union([
        z.literal(""),
        z
          .url()
          .max(2048, "Use um endereço de até 2048 caracteres")
          .refine(
            (value) => URL.canParse(value) && new URL(value).protocol === "https:",
            "Use um endereço HTTPS",
          )
          .superRefine(refuseContactLink),
      ])
      .default(""),
    note: freeText().trim().max(1000).superRefine(refuseContactDetails).default(""),
  })
  .superRefine((data, context) => {
    // Shipping needs the carrier and code; an occurrence on a parcel already shipped (it has a
    // note) may come without them: the marketplace may never have said which carrier it was.
    // The server checks the move into "shipped" itself (fulfillment.ts).
    if (data.status === "shipped" && !data.note && (!data.carrier || !data.trackingCode)) {
      context.addIssue({
        code: "custom",
        message: "Informe transportadora e código de rastreio",
        path: ["trackingCode"],
      });
    }
    if (data.status === "cancelled" && !data.note) {
      context.addIssue({
        code: "custom",
        message: "Informe o motivo do cancelamento",
        path: ["note"],
      });
    }
  });
export const supplierTokenSchema = z.string().regex(/^[a-f0-9]{64}$/, "Link inválido");
export const OPERATION_STAGES = ["all", "unforwarded", ...FULFILLMENT_STATUSES] as const;
/** Operations is work to do: its default is every date, so an old unforwarded sale stays in view. */
export const OPERATION_PERIODS = ["all", ...PERIOD_PRESETS] as const;
export type OperationPeriod = (typeof OPERATION_PERIODS)[number];

export const operationsSearchSchema = z.object({
  query: freeText().trim().max(100).default(""),
  stage: z.enum(OPERATION_STAGES).default("all"),
  page: z.number().int().min(1).max(MAX_PAGE).default(1),
  period: z.enum(OPERATION_PERIODS).default("all"),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  store: z.uuid().optional(),
});

/**
 * The Pedidos page's address: which tab is open and the operations filters, so coming back from
 * an order (or sharing the link) keeps them. The reviews tab keeps its own `query` and `page`.
 */
export const operationsUrlSearchSchema = z.object({
  view: withFallback(
    z.enum(["operations", "reviews", "tracking"]).default("operations"),
    "operations",
  ),
  /** The order the tracking tab opens on (from the order dialog); codes never go in the URL. */
  trackOrder: optionalParameter(z.uuid()),
  opQuery: optionalParameter(searchQuery()),
  stage: withFallback(z.enum(OPERATION_STAGES).default("all"), "all"),
  period: withFallback(z.enum(OPERATION_PERIODS).default("all"), "all"),
  from: optionalParameter(isoDateSchema),
  to: optionalParameter(isoDateSchema),
  store: optionalParameter(z.uuid()),
  // Same ceiling as the server's `page`: past it the server refused the whole request and the
  // tab showed an error instead of the last page.
  opPage: withFallback(z.coerce.number().int().min(1).max(MAX_PAGE).default(1), 1),
});
export type OperationsUrlSearch = z.infer<typeof operationsUrlSearchSchema>;
