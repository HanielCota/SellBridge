import type { OnboardingStep } from "@sellbridge/shared/customer-health";

interface ReminderRecipient {
  name: string;
  email: string;
}

interface ReminderEmail {
  to: string;
  subject: string;
  text: string;
}

/** What the reseller still has to do, and the page in the app where they do it. */
const STEP_GUIDES: Record<OnboardingStep, { action: string; why: string; path: string }> = {
  holder: {
    action: "informar seu nome completo e CPF",
    why: "Eles vão nas notas fiscais e nas cobranças da sua conta.",
    path: "/onboarding",
  },
  supplier: {
    action: "escolher o fornecedor que você vai vender",
    why: "Fornecedores de todo o Brasil: ele entrega direto ao seu cliente, sem você ter estoque.",
    path: "/onboarding",
  },
  store: {
    action: "conectar sua loja do marketplace",
    why: "Sem a loja conectada não conseguimos publicar produtos nem receber pedidos.",
    path: "/lojas",
  },
  listing: {
    action: "publicar seus primeiros produtos",
    why: "Escolha itens do catálogo e publique todos de uma vez na sua loja.",
    path: "/catalogo",
  },
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** The nudge an admin sends to a reseller who stopped halfway through the first steps. */
export function onboardingReminderEmail(
  recipient: ReminderRecipient,
  nextStep: OnboardingStep,
  appUrl: string,
): ReminderEmail {
  const guide = STEP_GUIDES[nextStep];
  const link = new URL(guide.path, appUrl).toString();
  return {
    to: recipient.email,
    subject: "Falta pouco para sua primeira venda no SellBridge",
    text: [
      `Olá, ${firstName(recipient.name)}!`,
      "",
      `Vimos que sua conta no SellBridge está quase pronta. O próximo passo é ${guide.action}.`,
      guide.why,
      "",
      "Continue de onde parou:",
      link,
      "",
      "Se precisar de ajuda, responda este e-mail ou abra um chamado no suporte.",
    ].join("\n"),
  };
}
