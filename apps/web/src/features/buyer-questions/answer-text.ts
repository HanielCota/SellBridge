/** "Para responder ou formular perguntas o máximo de caracteres é de 2.000." */
export const MAX_ANSWER_LENGTH = 2_000;

const count = new Intl.NumberFormat("pt-BR");

/** "12 de 2.000 caracteres": how much of the limit the answer uses. */
export function answerLengthLabel(text: string): string {
  return `${count.format(text.length)} de ${count.format(MAX_ANSWER_LENGTH)} caracteres.`;
}

/** Why the typed answer cannot be sent yet, in the reseller's words; null when it can. */
export function answerProblem(text: string): string | null {
  if (text.trim() === "") {
    return "Escreva a resposta antes de enviar.";
  }
  if (text.length > MAX_ANSWER_LENGTH) {
    return `A resposta pode ter até ${count.format(MAX_ANSWER_LENGTH)} caracteres. Apague ${count.format(text.length - MAX_ANSWER_LENGTH)} para enviar.`;
  }
  return null;
}
