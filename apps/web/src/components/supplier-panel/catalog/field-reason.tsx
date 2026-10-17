import type { RejectionReason } from "@sellbridge/shared/supplier-panel-catalog-status";
import { WarningCircleIcon } from "@phosphor-icons/react";

export type ReasonsByField = ReadonlyMap<string, readonly RejectionReason[]>;

export function groupReasons(reasons: readonly RejectionReason[]): ReasonsByField {
  const grouped = new Map<string, RejectionReason[]>();
  for (const reason of reasons) {
    grouped.set(reason.field, [...(grouped.get(reason.field) ?? []), reason]);
  }
  return grouped;
}

/** The reviewer's words, right under the field they are about. */
export function FieldReason({ field, reasons }: { field: string; reasons: ReasonsByField }) {
  const list = reasons.get(field);
  if (list === undefined || list.length === 0) {
    return null;
  }
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-footnote text-destructive dark:bg-destructive/20"
    >
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="font-medium">Motivo da reprovação</p>
        {list.map((reason) => (
          <p key={`${reason.rule}-${reason.message}`}>{reason.message}</p>
        ))}
      </div>
    </div>
  );
}
