import { z } from "zod";
import { SUPPLIER_CONVERSATION_TOPIC_IDS } from "../domain/supplier-conversation-topics.ts";
import { freeText } from "./common.ts";
import { refuseConversationContact } from "./contact-guard.ts";
import { optionalParameter } from "./fallback.ts";
import {
  optionalFormId,
  optionalFormText,
  ticketBodySchema,
  ticketsSearchSchema,
} from "./support.ts";

/**
 * A message between a reseller and their supplier: the website ticket rules plus the contact
 * block, so neither side can move the deal outside SellBridge.
 */
export const conversationBodySchema = ticketBodySchema.superRefine(refuseConversationContact);

/** The guided form: the store (its supplier comes with it), the topic, the situation, the text. */
export const createSupplierConversationSchema = z.object({
  storeConnectionId: z.uuid({ error: "Escolha a loja" }),
  topic: z.enum(SUPPLIER_CONVERSATION_TOPIC_IDS, { error: "Escolha sobre o que é a conversa" }),
  situation: optionalFormText(40),
  body: conversationBodySchema,
  /** An order of that store, so the supplier finds the case. */
  orderId: optionalFormId,
});
export type CreateSupplierConversationInput = z.infer<typeof createSupplierConversationSchema>;

export const replySupplierConversationSchema = z.object({ body: conversationBodySchema });

export const supplierConversationsSearchSchema = ticketsSearchSchema;
export type SupplierConversationsSearch = z.infer<typeof supplierConversationsSearchSchema>;

/** Prefills the new-conversation form from an order page (`pedido`) or a store (`loja`). */
export const newSupplierConversationSearchSchema = z.object({
  loja: optionalParameter(z.uuid()),
  pedido: optionalParameter(z.uuid()),
});
export type NewSupplierConversationSearch = z.infer<typeof newSupplierConversationSearchSchema>;

/** Orders of one store the reseller can attach, searched by order number or buyer. */
export const conversationOrdersSchema = z.object({
  storeConnectionId: z.uuid(),
  query: freeText().trim().max(100).optional(),
});
