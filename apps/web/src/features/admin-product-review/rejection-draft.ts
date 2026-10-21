import {
  rejectionReasonsSchema,
  type RejectionReason,
} from "@sellbridge/shared/supplier-panel-catalog-status";
import {
  reasonFromPreset,
  type ReviewReasonRule,
} from "@sellbridge/shared/supplier-product-review";

/** One reason being written: a stable key for React plus what goes to the supplier. */
export interface DraftReason extends RejectionReason {
  key: string;
}

export function addPresetReason(
  reasons: readonly DraftReason[],
  rule: ReviewReasonRule,
  key: string,
): DraftReason[] {
  return [...reasons, { ...reasonFromPreset(rule), key }];
}

export function updateReason(
  reasons: readonly DraftReason[],
  key: string,
  patch: Partial<RejectionReason>,
): DraftReason[] {
  return reasons.map((reason) => (reason.key === key ? { ...reason, ...patch } : reason));
}

export function removeReason(reasons: readonly DraftReason[], key: string): DraftReason[] {
  return reasons.filter((reason) => reason.key !== key);
}

export type RejectionCheck =
  | { readonly valid: true; readonly reasons: RejectionReason[] }
  | {
      readonly valid: false;
      readonly formError: string | null;
      readonly byKey: Map<string, string>;
    };

/**
 * Checks the reasons with the same schema the server applies, and maps each problem to the
 * reason it belongs to, so the reviewer sees it next to the text they need to fix.
 */
export function checkRejection(reasons: readonly DraftReason[]): RejectionCheck {
  const payload = reasons.map(({ field, rule, message }) => ({ field, rule, message }));
  const parsed = rejectionReasonsSchema.safeParse(payload);
  if (parsed.success) {
    return { valid: true, reasons: parsed.data };
  }
  const byKey = new Map<string, string>();
  let formError: string | null = null;
  for (const issue of parsed.error.issues) {
    const index = issue.path[0];
    const reason = typeof index === "number" ? reasons[index] : undefined;
    if (reason === undefined) {
      formError = issue.message;
      continue;
    }
    if (!byKey.has(reason.key)) {
      byKey.set(reason.key, issue.message);
    }
  }
  return { valid: false, formError, byKey };
}

/** A completeness problem the reviewer clicked becomes a reason, in the supplier's own words. */
export function addIssueReason(
  reasons: readonly DraftReason[],
  issue: { field: string; rule: string; message: string },
  key: string,
): DraftReason[] {
  if (reasons.some((reason) => reason.field === issue.field && reason.rule === issue.rule)) {
    return [...reasons];
  }
  return [...reasons, { field: issue.field, rule: issue.rule, message: issue.message, key }];
}
