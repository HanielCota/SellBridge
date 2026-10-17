import {
  REVIEW_REASON_PRESETS,
  reviewReasonTitle,
  type ReviewFieldOption,
  type ReviewReasonRule,
} from "@sellbridge/shared/supplier-product-review";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { TextareaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DraftReason } from "@/features/admin-product-review/rejection-draft";
import type { RejectionReason } from "@sellbridge/shared/supplier-panel-catalog-status";

function isPresetRule(value: string): value is ReviewReasonRule {
  return REVIEW_REASON_PRESETS.some((preset) => preset.rule === value);
}

function ReasonRow({
  reason,
  fieldOptions,
  error,
  onChange,
  onRemove,
}: {
  reason: DraftReason;
  fieldOptions: readonly ReviewFieldOption[];
  error: string | undefined;
  onChange: (patch: Partial<RejectionReason>) => void;
  onRemove: () => void;
}) {
  const fieldId = `reason-field-${reason.key}`;
  return (
    <li className="space-y-3 rounded-2xl bg-muted/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-footnote font-semibold">{reviewReasonTitle(reason.rule)}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label="Remover motivo"
        >
          <TrashIcon aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>Campo</Label>
        <Select value={reason.field} onValueChange={(field) => onChange({ field })}>
          <SelectTrigger id={fieldId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fieldOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TextareaField
        id={`reason-message-${reason.key}`}
        label="O que corrigir"
        value={reason.message}
        errors={error === undefined ? [] : [error]}
        onValueChange={(message) => onChange({ message })}
        rows={3}
        maxLength={500}
      />
    </li>
  );
}

function AddReason({ onAdd }: { onAdd: (rule: ReviewReasonRule) => void }) {
  return (
    <Select
      value=""
      onValueChange={(rule) => {
        if (isPresetRule(rule)) {
          onAdd(rule);
        }
      }}
    >
      <SelectTrigger className="w-full" aria-label="Adicionar motivo">
        <PlusIcon aria-hidden="true" />
        <SelectValue placeholder="Adicionar motivo" />
      </SelectTrigger>
      <SelectContent>
        {REVIEW_REASON_PRESETS.map((preset) => (
          <SelectItem key={preset.rule} value={preset.rule}>
            {preset.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface RejectionReasonsEditorProps {
  reasons: readonly DraftReason[];
  /** Fields a reason may point at, the product's datasheet included. */
  fieldOptions: readonly ReviewFieldOption[];
  errorsByKey: ReadonlyMap<string, string>;
  formError: string | null;
  onAdd: (rule: ReviewReasonRule) => void;
  onChange: (key: string, patch: Partial<RejectionReason>) => void;
  onRemove: (key: string) => void;
}

/** Each reason names a field and what to fix: the supplier reads it right under that field. */
export function RejectionReasonsEditor({
  reasons,
  fieldOptions,
  errorsByKey,
  formError,
  onAdd,
  onChange,
  onRemove,
}: RejectionReasonsEditorProps) {
  return (
    <div className="space-y-3">
      {reasons.length > 0 ? (
        <ul className="space-y-3">
          {reasons.map((reason) => (
            <ReasonRow
              key={reason.key}
              reason={reason}
              fieldOptions={fieldOptions}
              error={errorsByKey.get(reason.key)}
              onChange={(patch) => onChange(reason.key, patch)}
              onRemove={() => onRemove(reason.key)}
            />
          ))}
        </ul>
      ) : null}
      <AddReason onAdd={onAdd} />
      {formError === null ? null : (
        <p role="alert" className="text-footnote text-destructive">
          {formError}
        </p>
      )}
    </div>
  );
}
