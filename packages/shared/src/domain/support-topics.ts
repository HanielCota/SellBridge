import { validationError } from "../runtime/errors.ts";
import type { ProfileKind } from "./profile-kind.ts";
import { SELLER_SUPPORT_TOPICS } from "./support-topics-seller.ts";
import { SUPPLIER_SUPPORT_TOPICS } from "./support-topics-supplier.ts";
import type { TicketCategory, TicketPriority } from "./ticket-rules.ts";

/*
 * What the new-ticket form asks, per profile: a topic (stored as the ticket category), then what
 * is going on (the situation), then a guided description. Every customer-facing word of the flow
 * lives in the two topic files, so copy changes never touch the components.
 */

/** Situations only raise a ticket above normal; support can still change it afterwards. */
export type SupportSituationPriority = Extract<TicketPriority, "normal" | "high">;

export interface SupportSituation {
  /** Stable id sent by the form: never rename one, only its label. */
  id: string;
  label: string;
  /** One short line under the label: what fits this situation. */
  legend: string;
  priority: SupportSituationPriority;
  /** Heading of the description step: the one question the customer answers. */
  question: string;
  /** A sample answer shown under the field. */
  example: string;
  /** What attachment helps most, or null when none is expected. */
  attachmentTip: string | null;
  /** Shown once this situation is picked, for what the customer must know before writing. */
  notice: string | null;
}

export interface SupportTopic {
  category: TicketCategory;
  label: string;
  legend: string;
  /** Empty for "Outra coisa": the form goes straight to the description. */
  situations: readonly SupportSituation[];
  /** Used when the topic has no situations. */
  question: string;
  example: string;
}

export const SUPPORT_TOPICS: Readonly<Record<ProfileKind, readonly SupportTopic[]>> = {
  seller: SELLER_SUPPORT_TOPICS,
  supplier: SUPPLIER_SUPPORT_TOPICS,
};

const MIN_DESCRIPTION = 20;
/** Without a situation the team only has the text to go on, so it asks for a little more. */
const MIN_DESCRIPTION_WITHOUT_SITUATION = 40;
const SUBJECT_MAX = 120;
/** How much of the description names the ticket in the team's inbox. */
const SUBJECT_EXCERPT = 60;

export function supportTopicsFor(kind: ProfileKind): readonly SupportTopic[] {
  return SUPPORT_TOPICS[kind];
}

export function findSupportTopic(
  kind: ProfileKind,
  category: TicketCategory,
): SupportTopic | undefined {
  return SUPPORT_TOPICS[kind].find((topic) => topic.category === category);
}

export function findSupportSituation(
  topic: SupportTopic,
  situationId: string | undefined,
): SupportSituation | undefined {
  if (situationId === undefined) {
    return undefined;
  }
  return topic.situations.find((situation) => situation.id === situationId);
}

export function minimumDescriptionLength(topic: SupportTopic): number {
  return topic.situations.length === 0 ? MIN_DESCRIPTION_WITHOUT_SITUATION : MIN_DESCRIPTION;
}

/** Collapses line breaks and runs of spaces so an excerpt reads as one line. */
function singleLine(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function clip(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * The subject the team reads in the inbox: what is going on, then what it is about (an order
 * opened from its page) or the start of the description. Customers never type it.
 */
export function supportTicketSubject(input: {
  heading: string;
  about: string | undefined;
  description: string;
}): string {
  const detail = input.about ?? clip(singleLine(input.description), SUBJECT_EXCERPT);
  return clip(`${input.heading}: ${detail}`, SUBJECT_MAX);
}

export interface SupportTicketPlan {
  priority: SupportSituationPriority;
  subject: string;
}

/**
 * Checks what the form sent against the profile's topics and turns it into the ticket's priority
 * and subject. A topic with situations needs one of them; the description needs the topic's
 * minimum length, so a ticket never arrives with nothing to act on.
 */
export function planSupportTicket(input: {
  kind: ProfileKind;
  category: TicketCategory;
  situationId: string | undefined;
  about: string | undefined;
  description: string;
}): SupportTicketPlan {
  const topic = findSupportTopic(input.kind, input.category);
  if (topic === undefined) {
    throw validationError(
      `O tema "${input.category}" não existe para o perfil ${input.kind}; escolha um dos temas da tela`,
    );
  }
  const situation = findSupportSituation(topic, input.situationId);
  if (topic.situations.length > 0 && situation === undefined) {
    throw validationError(
      `A situação "${input.situationId ?? ""}" não existe no tema ${topic.category}; escolha o que está acontecendo`,
    );
  }
  if (input.description.trim().length < minimumDescriptionLength(topic)) {
    throw validationError("Conte um pouco mais para a equipe entender o caso");
  }
  const heading = situation?.label ?? topic.label;
  return {
    priority: situation?.priority ?? "normal",
    subject: supportTicketSubject({ heading, about: input.about, description: input.description }),
  };
}
