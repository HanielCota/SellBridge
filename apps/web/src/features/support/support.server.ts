import { addTicketMessage, createTicket, getAttachment } from "@sellbridge/db/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { createTicketSchema, replyTicketSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { handleApi, jsonResponse } from "@/lib/server/http";
import { fileStorage } from "@/lib/server/storage";
import { requireAdminSession, requireTenantSession } from "@/lib/server/tenant-session";
import { storeAttachments, textField, validateAttachments } from "./attachments.server";

const idSchema = z.uuid();

function parseId(value: string | undefined, label: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) {
    throw validationError(`${label} inválido`);
  }
  return parsed.data;
}

function firstIssue(error: z.ZodError): string {
  return error.issues.at(0)?.message ?? "Dados inválidos";
}

/** POST /api/suporte/chamados — opens a ticket (multipart: subject, body, files). */
export function handleCreateTicket(request: Request) {
  return handleApi("support.create_ticket", async () => {
    const session = await requireTenantSession(request.headers);
    const formData = await request.formData();
    const input = createTicketSchema.safeParse({
      subject: textField(formData, "subject"),
      body: textField(formData, "body"),
    });
    if (!input.success) {
      throw validationError(firstIssue(input.error));
    }
    const files = await validateAttachments(formData);
    const attachments = await storeAttachments(fileStorage, session.tenantId, files);
    const { ticketId } = await createTicket(db, {
      tenantId: session.tenantId,
      userId: session.userId,
      subject: input.data.subject,
      body: input.data.body,
      attachments,
    });
    logger.info("support.ticket_created", { tenantId: session.tenantId, ticketId });
    return jsonResponse(201, { ticketId });
  });
}

async function readReply(request: Request, tenantId: string) {
  const formData = await request.formData();
  const input = replyTicketSchema.safeParse({ body: textField(formData, "body") });
  if (!input.success) {
    throw validationError(firstIssue(input.error));
  }
  const files = await validateAttachments(formData);
  const attachments = await storeAttachments(fileStorage, tenantId, files);
  return { body: input.data.body, attachments };
}

/** POST /api/suporte/chamados/:ticketId/mensagens — reseller reply, scoped to the tenant. */
export function handleTenantReply(request: Request, ticketIdParam: string | undefined) {
  return handleApi("support.tenant_reply", async () => {
    const session = await requireTenantSession(request.headers);
    const ticketId = parseId(ticketIdParam, "Chamado");
    const reply = await readReply(request, session.tenantId);
    await addTicketMessage(db, {
      ticketId,
      tenantId: session.tenantId,
      authorId: session.userId,
      isAdmin: false,
      ...reply,
    });
    return jsonResponse(201, { ok: true });
  });
}

/** POST /api/admin/chamados/:ticketId/mensagens — support team reply. */
export function handleAdminReply(request: Request, ticketIdParam: string | undefined) {
  return handleApi("support.admin_reply", async () => {
    const admin = await requireAdminSession(request.headers);
    const ticketId = parseId(ticketIdParam, "Chamado");
    const reply = await readReply(request, "admin");
    await addTicketMessage(db, {
      ticketId,
      tenantId: null,
      authorId: admin.userId,
      isAdmin: true,
      ...reply,
    });
    logger.info("support.admin_replied", { ticketId, adminId: admin.userId });
    return jsonResponse(201, { ok: true });
  });
}

/** GET /api/suporte/anexos/:attachmentId — download for the owner tenant or an admin. */
export function handleDownloadAttachment(request: Request, attachmentIdParam: string | undefined) {
  return handleApi("support.download", async () => {
    const attachmentId = parseId(attachmentIdParam, "Anexo");
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonResponse(401, { error: "Faça login para baixar anexos" });
    }
    const scope =
      session.user.role === "admin" ? null : (await requireTenantSession(request.headers)).tenantId;
    const attachment = await getAttachment(db, attachmentId, scope);
    const bytes = await fileStorage.get(attachment.storageKey);
    if (!bytes) {
      return jsonResponse(404, { error: "Arquivo não encontrado no armazenamento" });
    }
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": attachment.mimeType,
        "content-disposition": `attachment; filename="${attachment.fileName}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  });
}
