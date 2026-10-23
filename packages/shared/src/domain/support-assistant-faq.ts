import type { ProfileKind } from "./profile-kind.ts";
import {
  alwaysNeedsHuman,
  type SupportAnswer,
  type SupportAssistant,
  type SupportAssistantQuestion,
  type SupportAssistantResult,
} from "./support-assistant.ts";
import { SUPPORT_FAQ, type SupportFaqEntry } from "./support-assistant-answers.ts";
import { OTHER_SITUATION_ID } from "./support-topics.ts";

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lowercase, without accents and with single spaces, so "Cartão" matches "cartao". */
export function normalizeQuestionText(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replace(/\s+/g, " ");
}

/** Only open-ended questions are read word by word; a picked situation says what it is about. */
function isOpenEnded(subtopic: string | undefined): boolean {
  return subtopic === undefined || subtopic === OTHER_SITUATION_ID;
}

function bySituation(
  entries: readonly SupportFaqEntry[],
  key: string,
): SupportFaqEntry | undefined {
  return entries.find((entry) => entry.situations.includes(key));
}

function byKeyword(entries: readonly SupportFaqEntry[], text: string): SupportFaqEntry | undefined {
  const normalized = normalizeQuestionText(text);
  return entries.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)));
}

/** The curated answer for a question, or undefined when a person should read it. */
export function matchFaqAnswer(question: SupportAssistantQuestion): SupportAnswer | undefined {
  if (alwaysNeedsHuman(question.topic, question.subtopic)) {
    return undefined;
  }
  const entries = SUPPORT_FAQ[question.profile];
  if (!isOpenEnded(question.subtopic)) {
    return bySituation(entries, `${question.topic}:${question.subtopic ?? ""}`)?.answer;
  }
  return byKeyword(entries, question.text)?.answer;
}

/** The answer a ticket form refers to by id, for the team's copy of what the customer saw. */
export function findFaqAnswer(profile: ProfileKind, answerId: string): SupportAnswer | undefined {
  return SUPPORT_FAQ[profile].find((entry) => entry.answer.id === answerId)?.answer;
}

/** The local, rule-based assistant: no network, same answer for the same question. */
export function createFaqSupportAssistant(): SupportAssistant {
  return {
    provider: "faq",
    async answer(question): Promise<SupportAssistantResult> {
      if (alwaysNeedsHuman(question.topic, question.subtopic)) {
        return { kind: "needs_human", reason: "always_human" };
      }
      const answer = matchFaqAnswer(question);
      if (answer === undefined) {
        return { kind: "needs_human", reason: "no_match" };
      }
      return { kind: "answer", answer };
    },
  };
}
