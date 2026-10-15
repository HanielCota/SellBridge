import type { LinkProps } from "@tanstack/react-router";

export interface SetupProgress {
  hasRegion: boolean;
  hasStore: boolean;
  hasPublishedListing: boolean;
}

export interface SetupStep {
  key: keyof SetupProgress;
  title: string;
  description: string;
  to: NonNullable<LinkProps["to"]>;
  cta: string;
}

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    key: "hasRegion",
    title: "Seu cadastro",
    description: "Nome, CPF e endereço para notas fiscais, cobranças e entrega.",
    to: "/onboarding",
    cta: "Completar cadastro",
  },
  {
    key: "hasStore",
    title: "Conecte uma loja",
    description: "Autorize o SellBridge na sua conta do marketplace.",
    to: "/lojas",
    cta: "Conectar loja",
  },
  {
    key: "hasPublishedListing",
    title: "Publique produtos",
    description: "Escolha vários produtos do catálogo e publique de uma vez.",
    to: "/catalogo",
    cta: "Abrir catálogo",
  },
];

export function countDoneSteps(progress: SetupProgress): number {
  return SETUP_STEPS.filter((step) => progress[step.key]).length;
}

/** The first step still pending, or undefined when the setup is done. */
export function findNextStep(progress: SetupProgress): SetupStep | undefined {
  return SETUP_STEPS.find((step) => !progress[step.key]);
}
