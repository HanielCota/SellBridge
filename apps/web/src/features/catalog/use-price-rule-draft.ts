import {
  MAX_MARKUP_PERCENT,
  MIN_MARKUP_PERCENT,
  priceRuleSchema,
  type PriceRule,
} from "@sellbridge/shared/schemas";
import { useState } from "react";

const DEFAULT_MARKUP_PERCENT = 60;

/** Shown under the markup field when the typed percentage is outside what the server accepts. */
export const MARKUP_RANGE_MESSAGE = `Use um valor entre ${MIN_MARKUP_PERCENT}% e ${MAX_MARKUP_PERCENT}%`;

function parseMarkup(percent: string): PriceRule | null {
  const parsed = priceRuleSchema.safeParse({
    kind: "markup",
    percent: Number.parseInt(percent, 10),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The price rule being edited in the bulk publish form. The markup percentage is kept as
 * typed text and validated with the same schema the server applies; while it is invalid
 * the preview falls back to the default markup and the rule cannot be submitted.
 */
export function usePriceRuleDraft() {
  const [kind, setKind] = useState<PriceRule["kind"]>("markup");
  const [percent, setPercent] = useState(String(DEFAULT_MARKUP_PERCENT));
  const markup = parseMarkup(percent);
  const percentValid = markup !== null;
  const fallbackMarkup: PriceRule = { kind: "markup", percent: DEFAULT_MARKUP_PERCENT };
  const rule: PriceRule = kind === "suggested" ? { kind } : (markup ?? fallbackMarkup);
  return {
    kind,
    setKind,
    percent,
    setPercent,
    percentValid,
    rule,
    isValid: kind === "suggested" || percentValid,
  };
}
