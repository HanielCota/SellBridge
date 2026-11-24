import { type ContactKind, findContactDetails, freeText } from "@sellbridge/shared/schemas";

/** "Para responder ou formular perguntas o máximo de caracteres é de 2.000." */
export const MAX_ANSWER_LENGTH = 2_000;

const count = new Intl.NumberFormat("pt-BR");
const list = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

const CONTACT_NAMES: Readonly<Record<ContactKind, string>> = {
  phone: "telefone",
  email: "e-mail",
  link: "link",
  social: "WhatsApp ou rede social",
};

/** "12 de 2.000 caracteres": how much of the limit the answer uses. */
export function answerLengthLabel(text: string): string {
  return `${count.format(text.length)} de ${count.format(MAX_ANSWER_LENGTH)} caracteres.`;
}

/**
 * Why the answer carries a contact, naming what was found; null when it carries none. Mercado
 * Livre moderates answers with personal data and can penalise the store for them.
 */
export function contactProblem(text: string): string | null {
  const kinds = findContactDetails(text);
  if (kinds.length === 0) {
    return null;
  }
  const found = list.format(kinds.map((kind) => CONTACT_NAMES[kind]));
  return `A resposta tem ${found}. O Mercado Livre não aceita contato fora dele: apague esse trecho para enviar.`;
}

/** Why the typed answer cannot be sent yet, in the reseller's words; null when it can. */
export function answerProblem(text: string): string | null {
  if (text.trim() === "") {
    return "Escreva a resposta antes de enviar.";
  }
  if (text.length > MAX_ANSWER_LENGTH) {
    return `A resposta pode ter até ${count.format(MAX_ANSWER_LENGTH)} caracteres. Apague ${count.format(text.length - MAX_ANSWER_LENGTH)} para enviar.`;
  }
  return contactProblem(text);
}

/** The answer as the server accepts it: the same rules the field shows while typing. */
export const answerTextSchema = freeText()
  .trim()
  .superRefine((text, context) => {
    const problem = answerProblem(text);
    if (problem !== null) {
      context.addIssue({ code: "custom", message: problem });
    }
  });
