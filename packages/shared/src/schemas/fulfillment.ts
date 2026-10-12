import { z } from "zod";

export const FULFILLMENT_STATUSES = [
  "forwarded",
  "accepted",
  "picking",
  "ready",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];
export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  forwarded: "Aguardando fornecedor",
  accepted: "Aceito",
  picking: "Em separação",
  ready: "Pronto para envio",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};
export const FULFILLMENT_NEXT: Record<FulfillmentStatus, FulfillmentStatus | null> = {
  forwarded: "accepted",
  accepted: "picking",
  picking: "ready",
  ready: "shipped",
  shipped: "delivered",
  delivered: null,
  cancelled: null,
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
