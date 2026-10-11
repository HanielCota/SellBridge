import {
  API_EVENT_DATA_SCHEMAS,
  apiEventTypeSchema,
  listingEventDataSchema,
  orderEventDataSchema,
} from "@sellbridge/shared/public-api";
import { z } from "zod";

export const apiEventSchema = z.object({
  id: z.uuid().describe("ID do evento; o mesmo vai no header `SellBridge-Event-Id` do webhook."),
  sequence: z
    .number()
    .int()
    .describe("Posição do evento na organização, sempre crescente. Use como cursor (`after`)."),
  type: apiEventTypeSchema,
  createdAt: z.iso.datetime(),
  data: z
    .union([orderEventDataSchema, listingEventDataSchema])
    .describe("Retrato do recurso no momento do evento; busque o recurso pelo ID para o resto."),
});
export type ApiEventDto = z.infer<typeof apiEventSchema>;

/**
 * Stored events whose type or data no longer match the public contract are skipped instead of
 * breaking the whole page; the cursor still moves past them.
 */
export function presentApiEvent(record: {
  id: string;
  sequence: number;
  type: string;
  data: unknown;
  createdAt: Date;
}): ApiEventDto | null {
  const type = apiEventTypeSchema.safeParse(record.type);
  if (!type.success) {
    return null;
  }
  const data = API_EVENT_DATA_SCHEMAS[type.data].safeParse(record.data);
  if (!data.success) {
    return null;
  }
  return {
    id: record.id,
    sequence: record.sequence,
    type: type.data,
    createdAt: record.createdAt.toISOString(),
    data: data.data,
  };
}
