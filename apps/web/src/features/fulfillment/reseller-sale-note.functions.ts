import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import { MAX_NFE_XML_BYTES } from "@sellbridge/shared/nfe-xml";
import { saveResellerSaleNote, uploadResellerSaleNoteXml } from "./reseller-sale-note.server";

/** The longest text accepted for a key: 44 digits plus the spaces of a copied DANFE. */
const MAX_TYPED_KEY_LENGTH = 80;

export const resellerSaleNoteSchema = z.object({
  shipmentId: z.uuid(),
  accessKey: z.string().max(MAX_TYPED_KEY_LENGTH, "A chave de acesso tem 44 números"),
});

/** The key of the reseller's own sale note, typed on the order (venda à ordem). */
export const saveResellerSaleNoteFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(resellerSaleNoteSchema)
  .handler(async ({ context, data }) => saveResellerSaleNote(context.tenantId, data));

export const resellerSaleNoteXmlSchema = z.object({
  shipmentId: z.uuid(),
  xml: z
    .string()
    .min(1, "Escolha o arquivo XML da nota")
    .max(MAX_NFE_XML_BYTES, "Este arquivo é grande demais para ser o XML de uma nota"),
});

/** The XML of the reseller's own sale note, sent on to the marketplace (venda à ordem). */
export const uploadResellerSaleNoteXmlFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(resellerSaleNoteXmlSchema)
  .handler(async ({ context, data }) => uploadResellerSaleNoteXml(context.tenantId, data));
