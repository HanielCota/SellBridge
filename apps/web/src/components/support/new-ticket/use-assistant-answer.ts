import { alwaysNeedsHuman, type SupportAnswer } from "@sellbridge/shared/support-assistant";
import type { TicketCategory } from "@sellbridge/shared/ticket-rules";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  askSupportAssistant,
  recordSupportAssistantResolved,
} from "@/features/support/assistant/support-assistant.functions";
import { focusStepHeading, STEP_HEADING_IDS } from "./step-parts";

export interface AssistantQuestion {
  category: TicketCategory;
  situationId: string | undefined;
  body: string;
}

/**
 * What asking led to: an answer is on screen, there is none (send the ticket), or the customer
 * changed the form while the assistant was thinking and the reply belongs to the old text.
 */
export type AskOutcome = "answered" | "no_answer" | "stale";

/**
 * The automatic answer shown before a ticket is sent. A failed request means "send the ticket":
 * the customer came to reach the team, and the server already logged why the assistant could
 * not answer.
 */
async function fetchAnswer(question: AssistantQuestion): Promise<SupportAnswer | null> {
  try {
    const result = await askSupportAssistant({
      data: {
        category: question.category,
        situation: question.situationId,
        body: question.body,
      },
    });
    return result.kind === "answer" ? result.answer : null;
  } catch {
    return null;
  }
}

/** The self-served outcome is a metric only: a failure to record it never holds the customer. */
async function recordResolved(question: AssistantQuestion, answerId: string): Promise<void> {
  try {
    await recordSupportAssistantResolved({
      data: { category: question.category, situation: question.situationId, answerId },
    });
  } catch {
    // The server logs the failed call; the customer's problem is solved either way.
  }
}

/** Asks once per description; editing anything clears the answer, so the next send asks again. */
export function useAssistantAnswer() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<SupportAnswer | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  // Bumped by every question and every edit: a reply that arrives after an edit is for text the
  // customer already changed, so it is dropped instead of shown (and sent) as theirs.
  const latestQuestion = useRef(0);

  async function ask(question: AssistantQuestion): Promise<AskOutcome> {
    // A topic reserved for a person never asks, and never flashes "Um momento…".
    if (alwaysNeedsHuman(question.category, question.situationId)) {
      return "no_answer";
    }
    latestQuestion.current += 1;
    const asked = latestQuestion.current;
    setIsAsking(true);
    const found = await fetchAnswer(question);
    if (asked !== latestQuestion.current) {
      return "stale";
    }
    setIsAsking(false);
    if (found === null) {
      return "no_answer";
    }
    setAnswer(found);
    focusStepHeading(STEP_HEADING_IDS.assistant);
    return "answered";
  }

  function clear() {
    latestQuestion.current += 1;
    setIsAsking(false);
    setAnswer(null);
  }

  async function resolve(question: AssistantQuestion | undefined) {
    if (question === undefined || answer === null || isResolving) {
      return;
    }
    setIsResolving(true);
    await recordResolved(question, answer.id);
    toast.success("Que bom que resolveu! Se precisar, é só abrir um chamado.");
    await navigate({ to: "/suporte" });
  }

  // A second press while asking or leaving would ask again or send a ticket nobody wants.
  const isBusy = isAsking || isResolving;
  return { answer, isAsking, isResolving, isBusy, ask, clear, resolve };
}
