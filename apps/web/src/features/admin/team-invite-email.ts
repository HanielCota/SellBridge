import type { ActionEmailContent } from "@sellbridge/shared/email-layout";

/**
 * Where an invited person lands after setting the password. The marker tells the reset e-mail
 * (auth.ts) to read as an invitation instead of "you asked for a new password".
 */
export const TEAM_INVITE_CALLBACK = "/redefinir-senha?convite=1";

/** Whether Better Auth's set-password link was asked for by a team invite. */
export function isTeamInviteLink(url: string): boolean {
  if (!URL.canParse(url)) {
    return false;
  }
  return new URL(url).searchParams.get("callbackURL") === TEAM_INVITE_CALLBACK;
}

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
