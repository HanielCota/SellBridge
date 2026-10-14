import {
  addTicketMessage,
  createTicket,
  findTicketEmailRecipients,
  findTicketRequester,
  getAttachment,
} from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { logger } from "@sellbridge/shared/logger";
import {
  adminTicketMessageSchema,
  createTicketSchema,
  replyTicketSchema,
} from "@sellbridge/shared/schemas";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { handleApi, jsonResponse } from "@/lib/server/http";
import { sendEmail } from "@/lib/server/mailer";
import { fileStorage } from "@/lib/server/storage";
import { requireStaffSession, requireTenantSession } from "@/lib/server/tenant-session";
import {
  storeAttachments,
  readSupportForm,
  textField,
  validateAttachments,
} from "./attachments.server";
import { supportReplyEmail } from "./support-reply-email";

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

/** POST /api/suporte/chamados: opens a ticket (multipart: category, subject, body, files). */
export function handleCreateTicket(request: Request) {
  return handleApi("support.create_ticket", async () => {
    const session = await requireTenantSession(request.headers);
    const formData = await readSupportForm(request);
    const input = createTicketSchema.safeParse({
      category: textField(formData, "category"),
      subject: textField(formData, "subject"),
      body: textField(formData, "body"),
    });
    if (!input.success) {
      throw validationError(firstIssue(input.error));
    }
    const files = await validateAttachments(formData);
    const attachments = await storeAttachments(fileStorage, session.tenantId, files);
    const { ticketId } = await createTicket(database, {
      tenantId: session.tenantId,
      userId: session.userId,
      category: input.data.category,
      subject: input.data.subject,
      body: input.data.body,
      attachments,
    });
    logger.info("support.ticket_created", { tenantId: session.tenantId, ticketId });
    return jsonResponse(201, { ticketId });
  });
}

async function readAttachments(formData: FormData, tenantId: string) {
  const files = await validateAttachments(formData);
  return storeAttachments(fileStorage, tenantId, files);
}

async function readReply(request: Request, tenantId: string) {
  const formData = await readSupportForm(request);
  const input = replyTicketSchema.safeParse({ body: textField(formData, "body") });
  if (!input.success) {
    throw validationError(firstIssue(input.error));
  }
  const attachments = await readAttachments(formData, tenantId);
  return { body: input.data.body, attachments };
}

function optionalTextField(formData: FormData, name: string): string | undefined {
  const value = textField(formData, name);
  return value === "" ? undefined : value;
}

/** Admin form: `kind` (reply | note), `body`, optional `statusAfter` for replies, files. */
async function readAdminMessage(request: Request) {
  const formData = await readSupportForm(request);
  const input = adminTicketMessageSchema.safeParse({
    kind: textField(formData, "kind"),
    body: textField(formData, "body"),
    statusAfter: optionalTextField(formData, "statusAfter"),
  });
  if (!input.success) {
    throw validationError(firstIssue(input.error));
  }
  const attachments = await readAttachments(formData, "admin");
  return { message: input.data, attachments };
}

/** POST /api/suporte/chamados/:ticketId/mensagens: reseller reply, scoped to the tenant. */
export function handleTenantReply(request: Request, ticketIdParam: string | undefined) {
  return handleApi("support.tenant_reply", async () => {
    const session = await requireTenantSession(request.headers);
    const ticketId = parseId(ticketIdParam, "Chamado");
    const reply = await readReply(request, session.tenantId);
    await addTicketMessage(database, {
      ticketId,
      tenantId: session.tenantId,
      authorId: session.userId,
      kind: "reseller",
      ...reply,
    });
    return jsonResponse(201, { ok: true });
  });
}

/**
 * Tells the store by e-mail that support answered: the requester and the colleagues following
 * the ticket, minus whoever turned the e-mails off. A failed e-mail never fails the reply: the
 * answer is saved and also shows up in the app.
 */
async function notifyFollowers(ticketId: string): Promise<void> {
  try {
    const requester = await findTicketRequester(database, ticketId);
    if (!requester) {
      return;
    }
    const recipients = await findTicketEmailRecipients(database, ticketId);
    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        sendEmail(
          supportReplyEmail(
            { ...recipient, subject: requester.subject },
            ticketId,
            environment.APP_URL,
          ),
        ),
      ),
    );
    // One bad address must not hide who did get the answer.
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length > 0) {
      logger.warn("support.reply_email_failed", {
        ticketId,
        failed: failures.length,
        sent: results.length - failures.length,
        error: failures[0]?.reason,
      });
    }
  } catch (error) {
    logger.warn("support.reply_email_failed", { ticketId, error });
  }
}

/** POST /api/admin/chamados/:ticketId/mensagens: support reply or internal note. */
export function handleAdminReply(request: Request, ticketIdParam: string | undefined) {
  return handleApi("support.admin_reply", async () => {
    const staff = await requireStaffSession(request.headers, "support.answer");
    const ticketId = parseId(ticketIdParam, "Chamado");
    const { message, attachments } = await readAdminMessage(request);
    const { status } = await addTicketMessage(database, {
      ticketId,
      tenantId: null,
      authorId: staff.userId,
      kind: message.kind,
      statusAfter: message.kind === "reply" ? message.statusAfter : undefined,
      body: message.body,
      attachments,
    });
    logger.info("support.admin_replied", {
      ticketId,
      staffId: staff.userId,
      kind: message.kind,
      status,
    });
    if (message.kind === "reply") {
      // Not awaited: the reply is saved, and a slow provider must not hold the agent's request.
      void notifyFollowers(ticketId);
    }
    return jsonResponse(201, { ok: true, status });
  });
}

/**
 * `?inline=1` lets an image open in the browser for the thread's preview. Only images: their
 * type was checked by magic bytes on upload, and `nosniff` keeps the browser to that type.
 */
function dispositionOf(request: Request, mimeType: string): "inline" | "attachment" {
  const wantsInline = new URL(request.url).searchParams.get("inline") === "1";
  if (wantsInline && mimeType.startsWith("image/")) {
    return "inline";
  }
  return "attachment";
}

/** GET /api/suporte/anexos/:attachmentId: download for the owner tenant or the support team. */
export function handleDownloadAttachment(request: Request, attachmentIdParam: string | undefined) {
  return handleApi("support.download", async () => {
    const attachmentId = parseId(attachmentIdParam, "Anexo");
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonResponse(401, { error: "Faça login para baixar anexos" });
    }
    const scope = hasStaffPermission(session.user.role, "support.answer")
      ? null
      : (await requireTenantSession(request.headers)).tenantId;
    const attachment = await getAttachment(database, attachmentId, scope);
    const bytes = await fileStorage.get(attachment.storageKey);
    if (!bytes) {
      return jsonResponse(404, { error: "Arquivo não encontrado no armazenamento" });
    }
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": attachment.mimeType,
        "content-disposition": `${dispositionOf(request, attachment.mimeType)}; filename="${attachment.fileName}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  });
}
