import { PAYMENT_SLOTS, resellerBlingSettingsSchema } from "@sellbridge/shared/reseller-bling";
import { z } from "zod";

/** How the reseller comes back from Bling's consent page to Integrações. */
export const RESELLER_BLING_OUTCOMES = [
  "conectado",
  "indisponivel",
  "sem_empresa",
  "sem_permissao",
  "visita",
  "cancelado",
  "expirado",
  "falhou",
] as const;
export type ResellerBlingOutcome = (typeof RESELLER_BLING_OUTCOMES)[number];

const outcomeSchema = z.enum(RESELLER_BLING_OUTCOMES);

/** The outcome in the page's address, or nothing for anything else. */
export function resellerBlingOutcomeSearch(search: Record<string, unknown>): {
  bling?: ResellerBlingOutcome;
} {
  const parsed = outcomeSchema.safeParse(search.bling);
  return parsed.success ? { bling: parsed.data } : {};
}

/** What the reseller reads after coming back from Bling, and whether it went well. */
export const RESELLER_BLING_OUTCOME_MESSAGES: Readonly<
  Record<ResellerBlingOutcome, { readonly ok: boolean; readonly text: string }>
> = {
  conectado: {
    ok: true,
    text: "Bling conectado. Agora escolha a natureza de operação e as formas de pagamento abaixo.",
  },
  indisponivel: { ok: false, text: "A integração com o Bling ainda não está disponível." },
  sem_empresa: {
    ok: false,
    text: "Cadastre o CNPJ da sua empresa em Meu cadastro para emitir a nota de venda pelo Bling.",
  },
  sem_permissao: { ok: false, text: "Só quem faz parte desta conta pode conectar o Bling dela." },
  visita: { ok: false, text: "Durante a visita da equipe não dá para conectar o Bling da conta." },
  cancelado: {
    ok: false,
    text: "A conexão foi cancelada no Bling. Clique em Conectar meu Bling quando quiser tentar de novo.",
  },
  expirado: {
    ok: false,
    text: "A conexão demorou demais para voltar do Bling. Clique em Conectar meu Bling de novo.",
  },
  falhou: {
    ok: false,
    text: "Não foi possível conectar o Bling agora. Tente de novo em alguns minutos.",
  },
};

export const resellerBlingSaveSchema = z.object({
  issueFromErp: z.boolean(),
  settings: resellerBlingSettingsSchema,
});

export type ResellerBlingSave = z.infer<typeof resellerBlingSaveSchema>;

/** What the reseller's Bling has, to check the choices against. */
export interface ResellerBlingChoices {
  readonly operationIds: readonly number[];
  readonly paymentMethodIds: readonly number[];
}

/**
 * Why the settings cannot be saved, in the reseller's words, or null when they can: issuing
 * needs a sale operation, and every chosen operation and payment method must be in the Bling.
 */
export function resellerBlingSaveRefusal(
  save: ResellerBlingSave,
  choices: ResellerBlingChoices,
): string | null {
  const { settings } = save;
  if (save.issueFromErp && settings.operationId === null) {
    return "Escolha a natureza de operação da venda para emitir pelo Bling.";
  }
  if (settings.operationId !== null && !choices.operationIds.includes(settings.operationId)) {
    return "Essa natureza de operação não está ativa no seu Bling. Atualize a página e escolha de novo.";
  }
  const methods = new Set(choices.paymentMethodIds);
  const unknown = PAYMENT_SLOTS.find((slot) => {
    const chosen = settings.paymentMethods[slot] ?? null;
    return chosen !== null && !methods.has(chosen);
  });
  if (unknown !== undefined) {
    return "Uma das formas de pagamento escolhidas não está ativa no seu Bling. Atualize a página e escolha de novo.";
  }
  return null;
}
