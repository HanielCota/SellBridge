import { firstErrorMessage, TextField } from "@/components/form/form-field";
import { SegmentedControl } from "@/components/data/segmented-control";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { SectionCard } from "@/components/layout/section-card";
import { HintedText } from "@/components/ui/hint";
import {
  ACCEPT_DAY_CHOICES,
  DISPATCH_DAY_CHOICES,
  deadlineExample,
  deadlineLabel,
  deadlineOptions,
  dispatchAfterAccept,
} from "@/features/supplier-panel/brand/brand-deadlines";
import type {
  BrandChange,
  BrandErrors,
  BrandValues,
} from "@/features/supplier-panel/brand/brand-form-values";

interface BrandOrdersCardProps {
  values: BrandValues;
  errors: BrandErrors;
  onChange: BrandChange;
}

function labelsFor(options: readonly string[]): Record<string, string> {
  return Object.fromEntries(options.map((hours) => [hours, deadlineLabel(Number(hours))]));
}

function DeadlineChoice({
  legend,
  hint,
  options,
  value,
  errors,
  onChange,
}: {
  legend: string;
  hint: string;
  options: readonly string[];
  value: string;
  errors: readonly string[];
  onChange: (hours: string) => void;
}) {
  const message = firstErrorMessage(errors);
  return (
    <div className="grid gap-2">
      <p className="text-sm leading-none font-medium" aria-hidden="true">
        <HintedText label={hint} focusable={false} className="hinted-term">
          {legend}
        </HintedText>
      </p>
      <SegmentedControl
        legend={legend}
        options={options}
        labels={labelsFor(options)}
        value={value}
        onChange={onChange}
      />
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}

/** "Pedidos": where orders arrive and how many days the supplier has to accept and dispatch. */
export function BrandOrdersCard({ values, errors, onChange }: BrandOrdersCardProps) {
  const acceptHours = Number(values.acceptWithinHours);
  const dispatchHours = Number(values.dispatchWithinHours);
  return (
    <SectionCard
      title="Pedidos"
      description="Só você e a equipe SellBridge veem. É por aqui que os pedidos chegam até você."
    >
      <div className="grid gap-5">
        <TextField
          id="supplier-contactEmail"
          label="E-mail para pedidos (opcional)"
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          value={values.contactEmail}
          maxLength={254}
          errors={errors.contactEmail ?? []}
          onValueChange={(contactEmail) => onChange({ contactEmail })}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <DeadlineChoice
            legend="Para aceitar o pedido"
            hint={TERM_HINTS.acceptDeadline}
            options={deadlineOptions(ACCEPT_DAY_CHOICES, acceptHours)}
            value={values.acceptWithinHours}
            errors={errors.acceptWithinHours ?? []}
            onChange={(hours) =>
              onChange({
                acceptWithinHours: hours,
                dispatchWithinHours: String(dispatchAfterAccept(Number(hours), dispatchHours)),
              })
            }
          />
          <DeadlineChoice
            legend="Para despachar"
            hint={TERM_HINTS.dispatchDeadline}
            options={deadlineOptions(DISPATCH_DAY_CHOICES, dispatchHours, acceptHours)}
            value={values.dispatchWithinHours}
            errors={errors.dispatchWithinHours ?? []}
            onChange={(dispatchWithinHours) => onChange({ dispatchWithinHours })}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {deadlineExample(acceptHours, dispatchHours)}
        </p>
      </div>
    </SectionCard>
  );
}
