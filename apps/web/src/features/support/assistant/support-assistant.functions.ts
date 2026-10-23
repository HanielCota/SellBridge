import { logger } from "@sellbridge/shared/logger";
import {
  askSupportAssistantSchema,
  supportAssistantOutcomeSchema,
} from "@sellbridge/shared/schemas";
import type { SupportAssistantResult } from "@sellbridge/shared/support-assistant";
import { createServerFn } from "@tanstack/react-start";
import { accountMiddleware } from "@/lib/server/middleware";
import { supportAssistant } from "./support-assistant.server";

/**
 * The automatic first answer for what the customer is about to send. Logs ids and the outcome
 * only: the customer's text never reaches the logs.
 */
export const askSupportAssistant = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .validator(askSupportAssistantSchema)
  .handler(async ({ context, data }): Promise<SupportAssistantResult> => {
    const result = await supportAssistant.answer({
      profile: context.profileKind,
      topic: data.category,
      subtopic: data.situation,
      text: data.body,
    });
    logger.info("support.assistant_asked", {
      tenantId: context.tenantId,
      provider: supportAssistant.provider,
      category: data.category,
      situation: data.situation ?? null,
      outcome: result.kind,
      answerId: result.kind === "answer" ? result.answer.id : null,
      reason: result.kind === "needs_human" ? result.reason : null,
    });
    return result;
  });

/** "Resolveu meu problema": the self-served metric, counted from this log line. */
export const recordSupportAssistantResolved = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .validator(supportAssistantOutcomeSchema)
  .handler(async ({ context, data }) => {
    logger.info("support.assistant_self_served", {
      tenantId: context.tenantId,
      provider: supportAssistant.provider,
      category: data.category,
      situation: data.situation ?? null,
      answerId: data.answerId,
    });
    return { ok: true };
  });
