import type { ActionEmailContent } from "@sellbridge/shared/email-layout";

/**
 * The set-password e-mail, worded as a welcome, for someone invited to the team who never came
 * in (`isPendingTeamInvite`, checked by auth.ts on the account, never on the request).
 */
export function teamInviteEmail(url: string): ActionEmailContent {
  return {
    subject: "Você foi convidado para a equipe do SellBridge",
    preview: "Crie sua senha para entrar na área da equipe. O link vale por 1 hora.",
    heading: "Boas-vindas à equipe",
    paragraphs: [
      "Você foi convidado para a equipe de suporte e operação do SellBridge.",
      "Crie sua senha pelo botão abaixo. Ele vale por 1 hora; se passar, peça um novo convite.",
    ],
    actionLabel: "Criar minha senha",
    actionUrl: url,
    footnote: "Se você não esperava este convite, pode ignorar este e-mail.",
  };
}
