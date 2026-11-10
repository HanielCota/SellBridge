import { z } from "zod";

/** Fixed outcomes the receiving page can name; free text in the URL would let a link speak. */
export const MERCADO_PAGO_OUTCOMES = [
  "ligada",
  "indisponivel",
  "sem_permissao",
  "visita",
  "cancelado",
  "expirado",
  "resposta_invalida",
  "falhou",
] as const;
export type MercadoPagoConnectOutcome = (typeof MERCADO_PAGO_OUTCOMES)[number];

const outcomeSchema = z.enum(MERCADO_PAGO_OUTCOMES);

/** The receiving page's `?mercadopago=` after the consent page; anything else is dropped. */
export function mercadoPagoOutcomeSearch(search: Record<string, unknown>): {
  mercadopago?: MercadoPagoConnectOutcome;
} {
  const parsed = outcomeSchema.safeParse(search.mercadopago);
  if (!parsed.success) {
    return {};
  }
  return { mercadopago: parsed.data };
}

/** What the supplier reads after coming back from Mercado Pago, and whether it went well. */
export const MERCADO_PAGO_OUTCOME_MESSAGES: Readonly<
  Record<MercadoPagoConnectOutcome, { readonly ok: boolean; readonly text: string }>
> = {
  ligada: {
    ok: true,
    text: "Conta Mercado Pago ligada. Os revendedores já podem pagar seus pedidos.",
  },
  indisponivel: { ok: false, text: "O pagamento pelo Mercado Pago ainda não está disponível." },
  sem_permissao: {
    ok: false,
    text: "Só quem faz parte deste fornecedor pode ligar a conta Mercado Pago dele.",
  },
  visita: {
    ok: false,
    text: "Durante a visita da equipe não dá para ligar a conta Mercado Pago do fornecedor.",
  },
  cancelado: {
    ok: false,
    text: "A autorização foi cancelada no Mercado Pago. Clique em Ligar conta Mercado Pago quando quiser tentar de novo.",
  },
  expirado: {
    ok: false,
    text: "Demorou demais para voltar do Mercado Pago. Clique em Ligar conta Mercado Pago de novo.",
  },
  resposta_invalida: {
    ok: false,
    text: "O Mercado Pago respondeu de um jeito inesperado. Clique em Ligar conta Mercado Pago de novo.",
  },
  falhou: {
    ok: false,
    text: "Não foi possível ligar a conta agora. Tente de novo em alguns minutos.",
  },
};

export interface MercadoPagoSettings {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly webhookSecret: string;
  readonly testMode: boolean;
  readonly apiUrl: string;
  readonly authUrl: string;
}

/** The application's settings, or null while any key is missing (the feature is off). */
export function mercadoPagoSettingsFrom(environment: {
  MERCADO_PAGO_CLIENT_ID?: string | undefined;
  MERCADO_PAGO_CLIENT_SECRET?: string | undefined;
  MERCADO_PAGO_WEBHOOK_SECRET?: string | undefined;
  MERCADO_PAGO_TEST_MODE: boolean;
  MERCADO_PAGO_API_URL: string;
  MERCADO_PAGO_AUTH_URL: string;
}): MercadoPagoSettings | null {
  const clientId = environment.MERCADO_PAGO_CLIENT_ID;
  const clientSecret = environment.MERCADO_PAGO_CLIENT_SECRET;
  const webhookSecret = environment.MERCADO_PAGO_WEBHOOK_SECRET;
  if (clientId == null || clientSecret == null || webhookSecret == null) {
    return null;
  }
  return {
    clientId,
    clientSecret,
    webhookSecret,
    testMode: environment.MERCADO_PAGO_TEST_MODE,
    apiUrl: environment.MERCADO_PAGO_API_URL.replace(/\/+$/, ""),
    authUrl: environment.MERCADO_PAGO_AUTH_URL.replace(/\/+$/, ""),
  };
}

export interface PaymentAccountRequester {
  /** The suppliers whose profile this user is a member of. */
  readonly supplierIds: readonly string[];
  /** The team member behind an "Entrar como cliente" visit, or null. */
  readonly impersonatedBy: string | null;
}

/**
 * Only a member of the supplier's own profile links its Mercado Pago account, never during a
 * team visit: the money of every later sale would go where someone else authorized.
 */
export function paymentAccountLinkRefusal(
  requester: PaymentAccountRequester,
  supplierId: string,
): Extract<MercadoPagoConnectOutcome, "sem_permissao" | "visita"> | null {
  if (requester.impersonatedBy !== null) {
    return "visita";
  }
  if (!requester.supplierIds.includes(supplierId)) {
    return "sem_permissao";
  }
  return null;
}

/** Who asks to act on the supplier's payment account, as the supplier panel sees them. */
export interface PaymentAccountActor {
  readonly viewerKind: "team" | "supplier" | "seller";
  readonly impersonatedBy: string | null;
}

/** Unlinking the account is the supplier's own act, like linking it. */
export function paymentAccountOwnerRefusal(actor: PaymentAccountActor): string | null {
  if (actor.impersonatedBy !== null) {
    return "Durante a visita da equipe não dá para mexer na conta Mercado Pago do fornecedor.";
  }
  if (actor.viewerKind !== "supplier") {
    return "Só quem faz parte deste fornecedor pode mexer na conta Mercado Pago dele.";
  }
  return null;
}

export const mercadoPagoStartQuerySchema = z.object({ fornecedor: z.uuid() });

export const mercadoPagoCallbackQuerySchema = z.union([
  z.object({ code: z.string().min(1).max(4096), state: z.string().min(1).max(200) }),
  z.object({ error: z.string().min(1).max(200), state: z.string().max(200).optional() }),
]);
