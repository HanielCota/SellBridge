import { alwaysNeedsHuman, type SupportAnswer } from "@sellbridge/shared/support-assistant";
import type { TicketCategory } from "@sellbridge/shared/ticket-rules";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
 * The automatic answer shown before a ticket is sent. A topic reserved for a person never asks;
 * a failed request means "send the ticket": the customer came to reach the team, and the server
 * already logged why the assistant could not answer.
 */
async function fetchAnswer(question: AssistantQuestion): Promise<SupportAnswer | null> {
  if (alwaysNeedsHuman(question.category, question.situationId)) {
    return null;
  }
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

/** Asks once per description; editing anything clears the answer, so the next send asks again. */
export function useAssistantAnswer() {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<SupportAnswer | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  /** True when an answer is now on screen and the ticket must wait for the customer. */
  async function ask(question: AssistantQuestion): Promise<boolean> {
    setIsAsking(true);
    const found = await fetchAnswer(question);
    setIsAsking(false);
    setAnswer(found);
    if (found === null) {
      return false;
    }
    focusStepHeading(STEP_HEADING_IDS.assistant);
    return true;
  }

  function clear() {
    setAnswer(null);
  }

  /** The self-served outcome is a metric only: a failure to record it never holds the customer. */
  async function resolve(question: AssistantQuestion | undefined) {
    if (question === undefined || answer === null || isResolving) {
      return;
    }
    setIsResolving(true);
    try {
      await recordSupportAssistantResolved({
        data: {
          category: question.category,
          situation: question.situationId,
          answerId: answer.id,
        },
      });
    } catch {
      // The server logs the failed call; the customer's problem is solved either way.
    }
    toast.success("Que bom que resolveu! Se precisar, é só abrir um chamado.");
    await navigate({ to: "/suporte" });
  }

  return { answer, isAsking, isResolving, ask, clear, resolve };
}
