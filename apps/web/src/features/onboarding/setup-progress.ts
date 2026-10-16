import type { LinkProps } from "@tanstack/react-router";

export interface SetupProgress {
  /** Full name and CPF of who invoices and charges go to. */
  hasHolder: boolean;
  /** A supplier picked during onboarding, or a shop already linked to one. */
  hasSupplier: boolean;
  /** The signed-in person confirmed the e-mail: a new store waits for it (item 26.b). */
  hasVerifiedEmail: boolean;
  hasStore: boolean;
  hasPublishedListing: boolean;
}

export interface SetupStep {
  key: keyof SetupProgress;
  title: string;
  description: string;
  to: NonNullable<LinkProps["to"]>;
  cta: string;
  /** Rough minutes the step takes, for the "pronta em ~X min" estimate (item 26.c). */
  estimatedMinutes: number;
}

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    key: "hasHolder",
    title: "Seus dados",
    description: "Nome completo e CPF para notas fiscais e cobranças.",
    to: "/onboarding",
    cta: "Completar cadastro",
    estimatedMinutes: 1,
  },
  {
    key: "hasSupplier",
    title: "Escolha um fornecedor",
    description: "De qualquer lugar do Brasil. Ele entrega direto ao seu cliente.",
    to: "/onboarding",
    cta: "Escolher fornecedor",
    estimatedMinutes: 2,
  },
  {
    key: "hasVerifiedEmail",
    title: "Confirme seu e-mail",
    description: "Abra o link que enviamos. Ele libera a conexão de lojas.",
    to: "/dashboard",
    cta: "Reenviar e-mail",
    estimatedMinutes: 1,
  },
  {
    key: "hasStore",
    title: "Conecte uma loja",
    description: "Autorize o SellBridge na sua conta do marketplace.",
    to: "/lojas",
    cta: "Conectar loja",
    estimatedMinutes: 3,
  },
  {
    key: "hasPublishedListing",
    title: "Publique produtos",
    description: "Escolha vários produtos do catálogo e publique de uma vez.",
    to: "/catalogo",
    cta: "Abrir catálogo",
    estimatedMinutes: 5,
  },
];

export function countDoneSteps(progress: SetupProgress): number {
  return SETUP_STEPS.filter((step) => progress[step.key]).length;
}

/** The first step still pending, or undefined when the setup is done. */
export function findNextStep(progress: SetupProgress): SetupStep | undefined {
  return SETUP_STEPS.find((step) => !progress[step.key]);
}

/** Share of the steps already done, 0 to 100. */
export function setupPercent(progress: SetupProgress): number {
  return Math.round((countDoneSteps(progress) / SETUP_STEPS.length) * 100);
}

/** Minutes the steps still pending should take. */
export function remainingSetupMinutes(progress: SetupProgress): number {
  return SETUP_STEPS.filter((step) => !progress[step.key]).reduce(
    (total, step) => total + step.estimatedMinutes,
    0,
  );
}

/** "Sua loja fica pronta em ~X min", or null once the setup is done. */
export function setupEtaLabel(progress: SetupProgress): string | null {
  const minutes = remainingSetupMinutes(progress);
  if (minutes === 0) {
    return null;
  }
  return `Sua loja fica pronta em ~${minutes} min`;
}
