import type { RejectionReason } from "@sellbridge/shared/supplier-panel-catalog-status";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";

interface FieldReasons {
  reasons: readonly RejectionReason[];
  /** The supplier changed the field since opening the form: the reason is being fixed. */
  edited: boolean;
}

export type ReasonsByField = ReadonlyMap<string, FieldReasons>;

export function groupReasons(
  reasons: readonly RejectionReason[],
  edited: ReadonlySet<string>,
): ReasonsByField {
  const grouped = new Map<string, FieldReasons>();
  for (const reason of reasons) {
    const current = grouped.get(reason.field)?.reasons ?? [];
    grouped.set(reason.field, { reasons: [...current, reason], edited: edited.has(reason.field) });
  }
  return grouped;
}

function ReasonMessages({ reasons }: { reasons: readonly RejectionReason[] }) {
  return reasons.map((reason) => <p key={`${reason.rule}-${reason.message}`}>{reason.message}</p>);
}

/**
 * The reviewer's words, right under the field they are about. Once the supplier changes the
 * field the alarm turns neutral: the reason stays readable, the red does not linger.
 */
export function FieldReason({ field, reasons }: { field: string; reasons: ReasonsByField }) {
  const entry = reasons.get(field);
  if (entry === undefined || entry.reasons.length === 0) {
    return null;
  }
  if (entry.edited) {
    return (
      <div
        role="note"
        className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-footnote text-muted-foreground"
      >
        <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">
            Alterado. Envie para análise quando terminar.
          </p>
          <ReasonMessages reasons={entry.reasons} />
        </div>
      </div>
    );
  }
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-footnote text-destructive dark:bg-destructive/20"
    >
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="font-medium">Motivo da reprovação</p>
        <ReasonMessages reasons={entry.reasons} />
      </div>
    </div>
  );
}
