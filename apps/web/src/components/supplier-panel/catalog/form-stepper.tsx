import type { CompletenessIssue } from "@sellbridge/shared/supplier-panel-catalog-completeness";
import { CheckIcon } from "@phosphor-icons/react";
import {
  FORM_STEPS,
  stepOfField,
  type FormStepId,
} from "@/features/supplier-panel/catalog/draft-form";
import { cn } from "@/lib/utils";

function blockingCountOf(step: FormStepId, blocking: readonly CompletenessIssue[]): number {
  return blocking.filter((issue) => stepOfField(issue.field) === step).length;
}

/** Pending count while something blocks; a check once the step is done (none on review). */
function StepMark({ step, pending }: { step: FormStepId; pending: number }) {
  if (pending > 0) {
    return (
      <span className="ml-auto rounded-full bg-destructive/10 px-1.5 text-caption text-destructive tabular-nums">
        <span className="sr-only">pendências:</span>
        {pending}
      </span>
    );
  }
  if (step === "review") {
    return null;
  }
  return <CheckIcon className="ml-auto size-3 text-emerald-600" aria-label="completa" />;
}

/**
 * The four steps as tabs the supplier can jump between at any time: each shows whether
 * something on it still blocks publishing, so nothing is found only at the end.
 */
export function FormStepper({
  current,
  blocking,
  onSelect,
}: {
  current: FormStepId;
  blocking: readonly CompletenessIssue[];
  onSelect: (step: FormStepId) => void;
}) {
  return (
    <nav aria-label="Etapas do cadastro">
      <ol className="grid grid-cols-4 gap-1.5">
        {FORM_STEPS.map((step, index) => {
          const active = step.id === current;
          const pending = step.id === "review" ? 0 : blockingCountOf(step.id, blocking);
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full flex-col gap-1.5 rounded-xl px-1 pt-1 pb-2 text-left transition-colors select-none hover:bg-muted sm:px-2 outline-none focus-visible:ring-4 focus-visible:ring-ring/30",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1 w-full rounded-full",
                    active ? "bg-primary" : pending > 0 ? "bg-destructive/40" : "bg-muted",
                  )}
                  aria-hidden="true"
                />
                <span className="flex items-center gap-1 text-footnote font-medium">
                  <span className="tabular-nums">{index + 1}.</span>
                  <span className="max-sm:sr-only">{step.label}</span>
                  <StepMark step={step.id} pending={pending} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm font-medium sm:hidden">
        {FORM_STEPS.find((step) => step.id === current)?.label}
      </p>
    </nav>
  );
}
