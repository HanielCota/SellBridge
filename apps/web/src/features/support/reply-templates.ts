import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { TicketStatus } from "@sellbridge/shared/schemas";

/** Values a template can reference as `{cliente}`, `{loja}`, `{assunto}` and `{atendente}`. */
export interface TemplateContext {
  customerName: string;
  storeName: string;
  subject: string;
  agentName: string;
}

export interface ReplyTemplate {
  id: string;
  label: string;
  body: string;
  /** Status the composer switches to when the template implies it (e.g. closing words). */
  statusAfter?: TicketStatus;
  /** Only offered on tickets of this kind of account; every kind when absent. */
  onlyFor?: ProfileKind;
}

export const REPLY_TEMPLATES: readonly ReplyTemplate[] = [
  {
    id: "greeting",
    label: "Saudação",
    body: "Olá, {cliente}! Tudo bem?\n\n",
  },
  {
    id: "analyzing",
    label: "Recebemos e estamos analisando",
    body: 'Olá, {cliente}! Recebemos seu chamado sobre "{assunto}" e já estamos analisando. Retornamos assim que tivermos uma atualização.',
    statusAfter: "answered",
  },
  {
    id: "need-details",
    label: "Pedir mais detalhes",
    body: "Olá, {cliente}! Para seguirmos com a análise, pode nos enviar mais detalhes? Se possível, inclua o número do pedido ou da publicação e um print da tela onde o problema aparece.",
    statusAfter: "answered",
  },
  {
    id: "fixed",
    label: "Ajuste feito na conta",
    body: "Olá, {cliente}! Fizemos o ajuste necessário na conta da loja {loja}. Pode conferir e nos avisar se ficou tudo certo?",
    statusAfter: "answered",
  },
  {
    id: "supplier",
    label: "Encaminhado ao fornecedor",
    body: "Olá, {cliente}! Encaminhamos o caso ao fornecedor e aguardamos o retorno. Assim que tivermos novidades, atualizamos este chamado.",
    statusAfter: "open",
    // A supplier is never "forwarded to the supplier".
    onlyFor: "seller",
  },
  {
    id: "resolved",
    label: "Resolvido, encerrando",
    body: "Olá, {cliente}! Como o problema foi resolvido, vamos encerrar este chamado. Se precisar de algo mais, é só responder aqui que ele é reaberto.",
    statusAfter: "closed",
  },
  {
    id: "signature",
    label: "Assinatura",
    body: "\n\nAtenciosamente,\n{atendente} · Suporte SellBridge",
  },
];

const PLACEHOLDERS: Record<string, keyof TemplateContext> = {
  cliente: "customerName",
  loja: "storeName",
  assunto: "subject",
  atendente: "agentName",
};

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/** First name only: replies read warmer with "Olá, Ana!" than with the full legal name. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/).at(0) ?? fullName;
}

/** Replaces known placeholders; unknown ones stay visible so the admin notices them. */
export function fillTemplate(body: string, context: TemplateContext): string {
  return body.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    const key = PLACEHOLDERS[name];
    if (!key) {
      return match;
    }
    return context[key];
  });
}

/** Text inserted at the caret, plus where the caret lands afterwards. */
export function insertAt(
  value: string,
  text: string,
  selectionStart: number,
  selectionEnd: number,
): { value: string; caret: number } {
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  return { value: `${before}${text}${after}`, caret: before.length + text.length };
}

/** Quotes a message e-mail style, so the reseller sees which point the answer refers to. */
export function quoteMessage(authorName: string, body: string): string {
  const quoted = body
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `> ${authorName} escreveu:\n${quoted}\n\n`;
}
