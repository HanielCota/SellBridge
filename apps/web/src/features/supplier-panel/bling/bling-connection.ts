import type { BlingAppCredentials } from "@sellbridge/marketplaces/bling";
import { z } from "zod";

/** Fixed outcomes the supplier panel can name; free text in the URL would let a link speak. */
export type BlingConnectOutcome =
  | "conectado"
  | "indisponivel"
  | "sem_permissao"
  | "visita"
  | "cancelado"
  | "expirado"
  | "resposta_invalida"
  | "falhou";

/** The app's keys, or null while they are not configured (the feature is off). */
export function blingCredentialsFrom(environment: {
  BLING_CLIENT_ID?: string | undefined;
  BLING_CLIENT_SECRET?: string | undefined;
}): BlingAppCredentials | null {
  const clientId = environment.BLING_CLIENT_ID;
  const clientSecret = environment.BLING_CLIENT_SECRET;
  if (clientId === undefined || clientSecret === undefined) {
    return null;
  }
  return { clientId, clientSecret };
}

export interface ErpConnectRequester {
  /** The suppliers whose profile this user is a member of. */
  readonly supplierIds: readonly string[];
  /** The team member behind an "Entrar como cliente" visit, or null. */
  readonly impersonatedBy: string | null;
}

/**
 * Only a member of the supplier's own profile connects its ERP account, never during a team
 * visit: the account would stay tied to the supplier after the visit, under someone else's
 * authorization. The team does not connect it either: it is the supplier's ERP.
 */
export function erpConnectRefusal(
  requester: ErpConnectRequester,
  supplierId: string,
): Extract<BlingConnectOutcome, "sem_permissao" | "visita"> | null {
  if (requester.impersonatedBy !== null) {
    return "visita";
  }
  if (!requester.supplierIds.includes(supplierId)) {
    return "sem_permissao";
  }
  return null;
}

export const blingStartQuerySchema = z.object({ fornecedor: z.uuid() });

export const blingCallbackQuerySchema = z.union([
  z.object({ code: z.string().min(1).max(4096), state: z.string().min(1).max(200) }),
  z.object({ error: z.string().min(1).max(200), state: z.string().max(200).optional() }),
]);
