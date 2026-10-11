import { listApiEvents } from "@sellbridge/database/repositories";
import { apiEventTypeSchema } from "@sellbridge/shared/public-api";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { defineApiEndpoint, noInput } from "../endpoint";
import { apiEventSchema, presentApiEvent } from "./events.presenter";

const eventTypesQuerySchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((type) => type.trim())
      .filter((type) => type.length > 0),
  )
  .pipe(z.array(apiEventTypeSchema));

export const listEventsQuerySchema = z.object({
  after: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(
      "Devolve só eventos com `sequence` maior que este. Comece com 0 e depois use o `nextAfter` da resposta anterior.",
    ),
  types: eventTypesQuerySchema
    .optional()
    .describe("Tipos de evento separados por vírgula, ex.: `order.created,order.status_changed`."),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Máximo de eventos por página (1 a 100)."),
});

export const listEvents = defineApiEndpoint({
  method: "GET",
  path: "/events",
  operationId: "listEvents",
  tag: "Eventos",
  summary: "Listar eventos",
  description:
    "Eventos da organização em ordem (`sequence` crescente), mantidos por 30 dias. Para acompanhar sem webhooks, " +
    "chame periodicamente com `after` igual ao `nextAfter` da resposta anterior. Use o `id` para ignorar repetições. " +
    "Um evento aparece aqui alguns segundos depois de acontecer, para que nenhum seja pulado.",
  scope: "events:read",
  params: noInput,
  query: listEventsQuerySchema,
  body: noInput,
  response: z.object({
    data: z.array(apiEventSchema),
    nextAfter: z
      .number()
      .int()
      .describe(
        "Cursor para a próxima chamada: o último `sequence` lido (ou o `after` enviado, se não houve eventos).",
      ),
  }),
  handle: async ({ context, query }) => {
    const records = await listApiEvents(database, context.tenantId, {
      afterSequence: query.after,
      limit: query.limit,
      types: query.types,
    });
    const last = records.at(-1);
    return {
      data: records.flatMap((record) => presentApiEvent(record) ?? []),
      nextAfter: last?.sequence ?? query.after,
    };
  },
});
