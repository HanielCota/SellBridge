import { firstName } from "./reply-templates";

interface Requester {
  name: string;
  email: string;
  subject: string;
}

/** The ticket body is not copied into the e-mail: the reply may carry account details. */
export function supportReplyEmail(requester: Requester, ticketId: string, appUrl: string) {
  const link = new URL(`/suporte/${ticketId}`, appUrl).toString();
  return {
    to: requester.email,
    subject: `Nova resposta no seu chamado: ${requester.subject}`,
    text: [
      `Olá, ${firstName(requester.name)}!`,
      "",
      `A equipe de suporte do SellBridge respondeu ao seu chamado "${requester.subject}".`,
      "",
      "Leia a resposta e continue a conversa por aqui:",
      link,
    ].join("\n"),
  };
}
