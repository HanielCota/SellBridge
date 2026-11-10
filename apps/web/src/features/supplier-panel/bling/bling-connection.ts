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

const BLING_OUTCOMES = [
  "conectado",
  "indisponivel",
  "sem_permissao",
  "visita",
  "cancelado",
  "expirado",
  "resposta_invalida",
  "falhou",
] as const satisfies readonly BlingConnectOutcome[];

const blingOutcomeSchema = z.enum(BLING_OUTCOMES);

/** The import page's `?bling=` after the Bling consent page; anything else is dropped. */
export function blingOutcomeSearch(search: Record<string, unknown>): {
  bling?: BlingConnectOutcome;
} {
  const parsed = blingOutcomeSchema.safeParse(search.bling);
  return parsed.success ? { bling: parsed.data } : {};
}

/** What the supplier reads after coming back from Bling, and whether it went well. */
export const BLING_OUTCOME_MESSAGES: Readonly<
  Record<BlingConnectOutcome, { readonly ok: boolean; readonly text: string }>
> = {
  conectado: { ok: true, text: "Bling conectado. Agora é só importar os produtos." },
  indisponivel: { ok: false, text: "A integração com o Bling ainda não está disponível." },
  sem_permissao: {
    ok: false,
    text: "Só quem faz parte deste fornecedor pode conectar o Bling dele.",
  },
  visita: {
    ok: false,
    text: "Durante a visita da equipe não dá para conectar o Bling do fornecedor.",
  },
  cancelado: {
    ok: false,
    text: "A conexão foi cancelada no Bling. Clique em Conectar Bling quando quiser tentar de novo.",
  },
  expirado: {
    ok: false,
    text: "A conexão demorou demais para voltar do Bling. Clique em Conectar Bling de novo.",
  },
  resposta_invalida: {
    ok: false,
    text: "O Bling respondeu de um jeito inesperado. Clique em Conectar Bling de novo.",
  },
  falhou: {
    ok: false,
    text: "Não foi possível conectar o Bling agora. Tente de novo em alguns minutos.",
  },
};

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

/** Who asks to act on the supplier's ERP account, as the supplier panel sees them. */
export interface ErpActor {
  readonly viewerKind: "team" | "supplier" | "seller";
  /** The team member behind an "Entrar como cliente" visit, or null. */
  readonly impersonatedBy: string | null;
}

/**
 * Writing to the supplier's ERP or forgetting its account is the supplier's own act, like
 * connecting it: neither the team on its own nor a team visit does it.
 */
export function erpOwnerActionRefusal(actor: ErpActor): string | null {
  if (actor.impersonatedBy !== null) {
    return "Durante a visita da equipe não dá para mexer no Bling do fornecedor.";
  }
  if (actor.viewerKind !== "supplier") {
    return "Só quem faz parte deste fornecedor pode mexer no Bling dele.";
  }
  return null;
}

/** Sending products to Bling needs the supplier itself and an account that is still connected. */
export function catalogExportRefusal(
  actor: ErpActor,
  connectionStatus: "connected" | "expired" | "error" | "disconnected" | null,
): string | null {
  const refusal = erpOwnerActionRefusal(actor);
  if (refusal !== null) {
    return refusal;
  }
  if (connectionStatus !== "connected") {
    return "Conecte o Bling antes de enviar os produtos.";
  }
  return null;
}
