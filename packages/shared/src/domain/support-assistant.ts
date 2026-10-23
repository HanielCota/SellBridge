import type { ProfileKind } from "./profile-kind.ts";
import type { TicketCategory } from "./ticket-rules.ts";

/*
 * The support assistant: an automatic first answer shown before a ticket reaches a person. This
 * file is the seam. Implementations (the local FAQ today, a language model later) answer the same
 * question with the same typed result, and anything they cannot answer goes to the team.
 */

export const SUPPORT_ASSISTANT_PROVIDERS = ["faq", "deepseek"] as const;
export type SupportAssistantProvider = (typeof SUPPORT_ASSISTANT_PROVIDERS)[number];

/** App pages an answer may point to; all of them open without required search parameters. */
export type SupportAnswerPath =
  | "/catalogo"
  | "/publicacoes"
  | "/lojas"
  | "/pedidos"
  | "/assinatura"
  | "/perfil"
  | "/fornecedor/painel/produtos"
  | "/fornecedor/painel/importar"
  | "/fornecedor/painel/marca";

export interface SupportAnswerLink {
  label: string;
  path: SupportAnswerPath;
}

export interface SupportAnswer {
  /** Stable id: the ticket form sends it back when the customer still needs help. */
  id: string;
  title: string;
  steps: readonly string[];
  links: readonly SupportAnswerLink[];
}

export interface SupportAssistantQuestion {
  profile: ProfileKind;
  topic: TicketCategory;
  /** The situation id picked in the form, when the topic has situations. */
  subtopic: string | undefined;
  text: string;
}

/**
 * Why a question goes straight to a person: the topic always needs one, nothing matched, or the
 * provider is not set up (or failed), so the caller can fall back to another provider.
 */
export type SupportNeedsHumanReason = "always_human" | "no_match" | "not_configured" | "failed";

export type SupportAssistantResult =
  | { kind: "answer"; answer: SupportAnswer }
  | { kind: "needs_human"; reason: SupportNeedsHumanReason };

export interface SupportAssistant {
  readonly provider: SupportAssistantProvider;
  answer(question: SupportAssistantQuestion): Promise<SupportAssistantResult>;
}

/**
 * Topics where an automatic answer would only delay the person who can act: money (payouts,
 * charges, disputes), anything about a specific order (late, wrong, returns, cancellations,
 * addresses) and account changes the team makes for the customer.
 */
const ALWAYS_HUMAN_TOPICS: ReadonlySet<TicketCategory> = new Set(["order", "payment"]);
const ALWAYS_HUMAN_SITUATIONS: ReadonlySet<string> = new Set(["account:update-details"]);

export function alwaysNeedsHuman(topic: TicketCategory, subtopic: string | undefined): boolean {
  if (ALWAYS_HUMAN_TOPICS.has(topic)) {
    return true;
  }
  if (subtopic === undefined) {
    return false;
  }
  return ALWAYS_HUMAN_SITUATIONS.has(`${topic}:${subtopic}`);
}

/**
 * The assistant's answer as kept on the ticket for the team: a support-only message the
 * customer never sees again, since they already read it before sending.
 */
export function formatAssistantNote(answer: SupportAnswer): string {
  const steps = answer.steps.map((step, index) => `${index + 1}. ${step}`);
  return [answer.title, ...steps].join("\n");
}

/**
 * The assistant's answer is stored as a ticket message written on the customer's behalf
 * (`isAdmin` false) but kept from the customer (`isInternal` true). No other message has that
 * pair: notes are written by the team, customer messages are public.
 */
export function isAssistantMessage(message: { isAdmin: boolean; isInternal: boolean }): boolean {
  return message.isInternal && !message.isAdmin;
}
