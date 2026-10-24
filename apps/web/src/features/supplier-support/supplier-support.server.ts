import {
  addTicketMessage,
  createTicket,
  findConversationForViewer,
  linkTicketOrder,
  queueSupplierConversationNotice,
  requireConversationOrder,
  requireConversationStore,
  type ConversationViewer,
} from "@sellbridge/database/repositories";
import { notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { assertSellerProfile } from "@/lib/server/supplier-panel-access";
import {
  createSupplierConversationSchema,
  replySupplierConversationSchema,
  type CreateSupplierConversationInput,
} from "@sellbridge/shared/schemas";
import { planSupplierConversation } from "@sellbridge/shared/supplier-conversation-topics";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { assertSameOrigin, handleApi, jsonResponse } from "@/lib/server/http";
import { fileStorage } from "@/lib/server/storage";
import { assertAllowedWhileImpersonating } from "@/lib/server/impersonation-rules";
import { requireTenantRequest, type TenantSession } from "@/lib/server/tenant-session";
import {
  saveWithAttachments,
  storeAttachments,
  textField,
  validateAttachments,
} from "@/features/support/attachments.server";
import { parseId, readUploadForm } from "@/features/support/support.server";
import { parseConversationForm, type ConversationAuthor } from "./conversation-contact.server";
import { conversationViewerOf } from "./conversation-viewer.server";

function authorOf(session: TenantSession, side: ConversationAuthor["side"]): ConversationAuthor {
  return {
    side,
    tenantId: session.tenantId,
    userId: session.userId,
    impersonatedBy: session.impersonatedBy,
  };
}

/** The team learns nothing here; the other side gets its e-mail. A failure never undoes the message. */
async function notifyOtherSide(ticketId: string, recipient: "reseller" | "supplier") {
  try {
    await queueSupplierConversationNotice(database, { ticketId, recipient, at: new Date() });
  } catch (error) {
    logger.warn("supplier_support.notice_failed", { ticketId, recipient, error });
  }
}

/** The form's store, situation and order, checked against the account before any file is saved. */
async function planConversation(session: TenantSession, input: CreateSupplierConversationInput) {
  const plan = planSupplierConversation({
    topicId: input.topic,
    situationId: input.situation,
    description: input.body,
  });
  const store = await requireConversationStore(database, {
    tenantId: session.tenantId,
    storeConnectionId: input.storeConnectionId,
  });
  if (input.orderId !== undefined) {
    await requireConversationOrder(database, {
      tenantId: session.tenantId,
      storeConnectionId: input.storeConnectionId,
      orderId: input.orderId,
    });
  }
  return { plan, store };
}

async function readNewConversation(request: Request, session: TenantSession) {
  const formData = await readUploadForm(request, session.userId);
  const fields = {
    storeConnectionId: textField(formData, "storeConnectionId"),
    topic: textField(formData, "topic"),
    situation: textField(formData, "situation"),
    body: textField(formData, "body"),
    orderId: textField(formData, "orderId"),
  };
  const input = await parseConversationForm(
    createSupplierConversationSchema,
    fields,
    authorOf(session, "reseller"),
  );
  return { input, files: await validateAttachments(formData) };
}

/**
 * POST /api/suporte/conversas: a reseller writes to the supplier of one of their stores
 * (multipart: storeConnectionId, topic, situation, body, orderId, files).
 */
export function handleCreateConversation(request: Request) {
  return handleApi("supplier_support.create", async () => {
    assertSameOrigin(request, environment.APP_URL);
    const session = await requireTenantRequest(request);
    assertSellerProfile(session.profileKind);
    assertAllowedWhileImpersonating({
      impersonatedBy: session.impersonatedBy,
      customerId: session.userId,
      functionName: "supplierSupport.createConversation",
      method: "POST",
    });
    const { input, files } = await readNewConversation(request, session);
    const { plan, store } = await planConversation(session, input);
    const attachments = await storeAttachments(fileStorage, session.tenantId, files);
    const { ticketId } = await saveWithAttachments(fileStorage, attachments, () =>
      createTicket(database, {
        tenantId: session.tenantId,
        userId: session.userId,
        category: plan.category,
        priority: plan.priority,
        subject: plan.subject,
        body: input.body,
        attachments,
        conversation: {
          supplierId: store.supplierId,
          storeConnectionId: input.storeConnectionId,
          topic: input.topic,
        },
      }),
    );
    if (input.orderId !== undefined) {
      await linkTicketOrder(database, {
        ticketId,
        tenantId: session.tenantId,
        orderId: input.orderId,
        actorId: session.userId,
      });
    }
    logger.info("supplier_support.created", { tenantId: session.tenantId, ticketId });
    void notifyOtherSide(ticketId, "supplier");
    return jsonResponse(201, { ticketId });
  });
}

async function saveReply(input: {
  session: TenantSession;
  viewer: ConversationViewer;
  ticketId: string;
  request: Request;
}) {
  const { session, viewer, ticketId } = input;
  const formData = await readUploadForm(input.request, session.userId);
  const reply = await parseConversationForm(
    replySupplierConversationSchema,
    { body: textField(formData, "body") },
    authorOf(session, viewer.side),
  );
  const files = await validateAttachments(formData);
  const attachments = await storeAttachments(fileStorage, session.tenantId, files);
  const isReseller = viewer.side === "reseller";
  return saveWithAttachments(fileStorage, attachments, () =>
    addTicketMessage(database, {
      ticketId,
      tenantId: isReseller ? session.tenantId : null,
      authorId: session.userId,
      kind: isReseller ? "reseller" : "reply",
      answeredBy: isReseller ? "platform" : "supplier",
      body: reply.body,
      attachments,
    }),
  );
}

/** POST /api/suporte/conversas/:ticketId/mensagens: a message from either side. */
export function handleConversationReply(request: Request, ticketIdParam: string | undefined) {
  return handleApi("supplier_support.reply", async () => {
    assertSameOrigin(request, environment.APP_URL);
    const session = await requireTenantRequest(request);
    assertAllowedWhileImpersonating({
      impersonatedBy: session.impersonatedBy,
      customerId: session.userId,
      functionName: "supplierSupport.reply",
      method: "POST",
    });
    const ticketId = parseId(ticketIdParam, "Conversa");
    const viewer = await conversationViewerOf(session);
    const conversation = await findConversationForViewer(database, { ticketId, viewer });
    if (conversation === null) {
      throw notFoundError("Conversa não encontrada");
    }
    const { status } = await saveReply({ session, viewer, ticketId, request });
    logger.info("supplier_support.replied", { ticketId, side: viewer.side, status });
    void notifyOtherSide(ticketId, viewer.side === "reseller" ? "supplier" : "reseller");
    return jsonResponse(201, { ok: true, status });
  });
}
