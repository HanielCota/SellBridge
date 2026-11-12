import type { z } from "zod";
import { emojiRefusalMessage, hasEmoji } from "../domain/emoji.ts";

/** For product and listing descriptions, which reach Mercado Livre as they are stored. */
export function refuseEmoji(text: string, context: z.RefinementCtx): void {
  if (hasEmoji(text)) {
    context.addIssue({ code: "custom", message: emojiRefusalMessage(text) });
  }
}
