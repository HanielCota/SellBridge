import {
  MAX_PROFIT_MARGIN_PERCENT,
  MIN_PROFIT_MARGIN_PERCENT,
  priceRuleSchema,
  type PriceRule,
} from "@sellbridge/shared/schemas";
import { useState } from "react";

/** The margin the bulk form starts with: the first "Margem" shortcut of one listing. */
const DEFAULT_MARGIN_PERCENT = 30;

/** Shown under the margin field when the typed percentage is outside what the server accepts. */
export const MARGIN_RANGE_MESSAGE = `Use uma margem entre ${MIN_PROFIT_MARGIN_PERCENT}% e ${MAX_PROFIT_MARGIN_PERCENT}%`;

/**
 * The margin rule for a typed percentage, or null when the server would reject it. Only whole
 * digits count: "12.5" or "30abc" are invalid, never silently read as 12% or 30%.
 */
export function parseMarginPercent(percent: string): PriceRule | null {
  const typed = percent.trim();
  const parsed = priceRuleSchema.safeParse({
    kind: "margin",
    percent: /^\d{1,4}$/.test(typed) ? Number(typed) : Number.NaN,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The price rule being edited in the bulk publish form. The margin is kept as typed text and
 * validated with the same schema the server applies; while it is invalid the preview falls back
 * to the default margin and the rule cannot be submitted.
 */
export function usePriceRuleDraft(initialKind: "margin" | "suggested" = "margin") {
  const [kind, setKind] = useState<"margin" | "suggested">(initialKind);
  const [percent, setPercent] = useState(String(DEFAULT_MARGIN_PERCENT));
  const margin = parseMarginPercent(percent);
  const percentValid = margin !== null;
  const fallbackMargin: PriceRule = { kind: "margin", percent: DEFAULT_MARGIN_PERCENT };
  const rule: PriceRule = kind === "suggested" ? { kind } : (margin ?? fallbackMargin);
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

/**
 * Margins typed for single products in the bulk publish form, keyed by product id. Each one
 * replaces the shared rule for its product; while any is invalid the form cannot be submitted.
 */
export function usePriceOverrides() {
  const [percents, setPercents] = useState<ReadonlyMap<string, string>>(new Map());
  const setPercent = (productId: string, percent: string) =>
    setPercents((current) => new Map(current).set(productId, percent));
  const clear = (productId: string) =>
    setPercents((current) => {
      const next = new Map(current);
      next.delete(productId);
      return next;
    });
  const parsed = [...percents].map(([productId, percent]) => ({
    productId,
    margin: parseMarginPercent(percent),
  }));
  const isValid = parsed.every(({ margin }) => margin !== null);
  const rules: Readonly<Record<string, PriceRule>> = Object.fromEntries(
    parsed.flatMap(({ productId, margin }) => (margin ? [[productId, margin]] : [])),
  );
  return {
    percentFor: (productId: string) => percents.get(productId),
    setPercent,
    clear,
    count: percents.size,
    rules,
    isValid,
  };
}
