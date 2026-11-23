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

/** Where the supplier starts authorizing the SellBridge app in its Bling (first time or again). */
export function blingConnectHref(supplierId: string): string {
  return `/api/integracoes/bling/conectar?fornecedor=${encodeURIComponent(supplierId)}`;
}

/** Why the supplier is asked to reconnect a Bling that lacks a permission, in its own words. */
export const BLING_RECONNECT_REASON =
  "Seu Bling precisa ser reconectado para o SellBridge continuar lendo o estoque e emitindo notas.";

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

/**
 * Turning the NF-e on makes every new order produce a note with fiscal value, so it needs the
 * supplier itself, a connected account and the company's fiscal data. Turning it off only needs
 * the supplier.
 */
export function invoicingRefusal(input: {
  actor: ErpActor;
  enabling: boolean;
  connectionStatus: "connected" | "expired" | "error" | "disconnected" | null;
  fiscalReady: boolean;
}): string | null {
  const refusal = erpOwnerActionRefusal(input.actor);
  if (refusal !== null || !input.enabling) {
    return refusal;
  }
  if (input.connectionStatus !== "connected") {
    return "Conecte o Bling antes de ligar a nota fiscal.";
  }
  if (!input.fiscalReady) {
    return "Preencha os dados fiscais da empresa em Marca antes de ligar a nota fiscal.";
  }
  return null;
}

/**
 * Why the venda à ordem operations cannot be saved, or null: only the supplier itself, with Bling
 * connected, two different operations, both active in its Bling.
 */
export function onBehalfOperationsRefusal(input: {
  actor: ErpActor;
  connected: boolean;
  knownOperationIds: ReadonlySet<number>;
  shipmentOperationId: number;
  saleOperationId: number;
}): string | null {
  const refusal = erpOwnerActionRefusal(input.actor);
  if (refusal !== null) {
    return refusal;
  }
  if (!input.connected) {
    return "Conecte o Bling antes de escolher as naturezas de operação.";
  }
  if (input.shipmentOperationId === input.saleOperationId) {
    return "A remessa e a venda para o revendedor usam naturezas diferentes. Escolha uma para cada.";
  }
  const known = input.knownOperationIds;
  if (!known.has(input.shipmentOperationId) || !known.has(input.saleOperationId)) {
    return "Uma das naturezas escolhidas não está mais ativa no seu Bling. Atualize a página e escolha de novo.";
  }
  return null;
}
