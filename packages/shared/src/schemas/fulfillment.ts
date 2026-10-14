import { z } from "zod";

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
} as const;
/** Why the supplier link stops at dispatch; said by the server and shown on the link alike. */
export const DELIVERY_CONFIRMED_BY =
  "Quem confirma a entrega é a loja que fez a venda, ou o rastreio do Mercado Livre quando a venda é de lá.";
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
  recipient: z.string().trim().min(2).max(120),
  street: z.string().trim().min(2).max(200),
  number: z.string().trim().min(1).max(30),
  complement: z.string().trim().max(150).default(""),
  neighborhood: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  state: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "Informe a UF com duas letras"),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
});
export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;
export const forwardOrderSchema = z.object({
  orderId: z.uuid(),
  address: deliveryAddressSchema,
  notes: z.string().trim().max(1000).default(""),
});
export const shipmentUpdateSchema = z
  .object({
    shipmentId: z.uuid(),
    status: z.enum(FULFILLMENT_STATUSES),
    carrier: z.string().trim().max(100).default(""),
    trackingCode: z.string().trim().max(100).default(""),
    trackingUrl: z
      .union([
        z.literal(""),
        z.url().refine((value) => new URL(value).protocol === "https:", "Use um endereço HTTPS"),
      ])
      .default(""),
    note: z.string().trim().max(1000).default(""),
  })
  .superRefine((data, ctx) => {
    if (data.status === "shipped" && (!data.carrier || !data.trackingCode)) {
      ctx.addIssue({
        code: "custom",
        message: "Informe transportadora e código de rastreio",
        path: ["trackingCode"],
      });
    }
    if (data.status === "cancelled" && !data.note) {
      ctx.addIssue({ code: "custom", message: "Informe o motivo do cancelamento", path: ["note"] });
    }
  });
export const supplierTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const operationsSearchSchema = z.object({
  query: z.string().trim().max(100).default(""),
  stage: z.enum(["all", "unforwarded", ...FULFILLMENT_STATUSES]).default("all"),
  page: z.number().int().min(1).default(1),
});
