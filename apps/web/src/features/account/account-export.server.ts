import { collectAccountExport } from "@sellbridge/database/repositories";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { listMemberships } from "@/lib/server/membership";
import { requireAccountSession, requireTenantSession } from "@/lib/server/tenant-session";
import { createUploadLimiter } from "@/lib/server/upload-rate-limit";

/** A few downloads an hour: enough to retry, not enough to hammer the database. */
const accountExports = createUploadLimiter({ maxRequests: 3, windowMilliseconds: 60 * 60_000 });

function textResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

interface ExportOwner {
  userId: string;
  /** Null for a team member with no profile: only the personal data goes out. */
  tenantId: string | null;
  impersonatedBy: string | null;
}

/** The profile's session, or the person's alone when the account has no profile at all. */
async function requireExportOwner(headers: Headers): Promise<ExportOwner> {
  const account = await requireAccountSession(headers);
  const memberships = await listMemberships(account.userId);
  if (memberships.length === 0) {
    return { ...account, tenantId: null };
  }
  return requireTenantSession(headers);
}

/** The owner, or the response for why there is none (signed out, other profile, visit over). */
async function findExportOwner(headers: Headers): Promise<ExportOwner | Response> {
  try {
    return await requireExportOwner(headers);
  } catch (error) {
    if (isAppError(error) && error.code === "UNAUTHORIZED") {
      return textResponse(401, "Entre na sua conta para baixar seus dados.");
    }
    if (isAppError(error)) {
      return textResponse(403, error.userMessage);
    }
    throw error;
  }
}

/** GET /api/conta/exportar: the signed-in account's own data as a JSON file (LGPD). */
export async function handleAccountExport(request: Request): Promise<Response> {
  const session = await findExportOwner(request.headers);
  if (session instanceof Response) {
    return session;
  }
  // The data is the customer's: the team visiting the account does not take it home.
  if (session.impersonatedBy !== null) {
    return textResponse(403, "Só o próprio cliente baixa os dados da conta.");
  }
  if (!accountExports.take(session.userId)) {
    return textResponse(429, "Você já baixou seus dados algumas vezes. Tente de novo em 1 hora.");
  }
  const exported = await collectAccountExport(database, {
    userId: session.userId,
    tenantId: session.tenantId,
  });
  logger.info("account.exported", { userId: session.userId, tenantId: session.tenantId });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(exported, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="sellbridge-meus-dados-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
