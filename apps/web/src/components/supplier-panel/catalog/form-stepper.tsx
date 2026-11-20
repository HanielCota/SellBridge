import type { CompletenessIssue } from "@sellbridge/shared/supplier-panel-catalog-completeness";
import { CheckIcon } from "@phosphor-icons/react";
import { phoneStepLine, type FormStep } from "@/features/supplier-panel/catalog/draft-form";
import { cn } from "@/lib/utils";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

function blockingCountOf<TStep extends string>(
  step: TStep,
  blocking: readonly CompletenessIssue[],
  stepOf: (field: string) => TStep,
): number {
  return blocking.filter((issue) => stepOf(issue.field) === step).length;
}

/** Pending count while something blocks; a check once the step is done (none on review). */
function StepMark({ step, pending }: { step: string; pending: number }) {
  if (pending > 0) {
    return (
      // Inside the step button: the legend opens on hover or tap, not as a stop of its own.
      <HintedText label={TERM_HINTS.stepPending} focusable={false} className="ml-auto">
        <span className="rounded-full bg-destructive/10 px-1.5 text-caption text-destructive tabular-nums">
          <span className="sr-only">pendências:</span>
          {pending}
        </span>
      </HintedText>
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
export function FormStepper<TStep extends string>({
  current,
  blocking,
  onSelect,
  steps,
  stepOf,
}: {
  current: TStep;
  blocking: readonly CompletenessIssue[];
  onSelect: (step: TStep) => void;
  /** The form's steps, in order; the last is the review, which never counts pending items. */
  steps: readonly FormStep<TStep>[];
  /** The step that shows a field, so each tab counts what blocks publishing on it. */
  stepOf: (field: string) => TStep;
}) {
  return (
    <nav aria-label="Etapas do cadastro">
      <ol className={cn("grid gap-1.5", steps.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {steps.map((step, index) => {
          const active = step.id === current;
          const pending = step.id === "review" ? 0 : blockingCountOf(step.id, blocking, stepOf);
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
      <p className="mt-2 text-sm font-medium sm:hidden">{phoneStepLine(current, steps)}</p>
    </nav>
  );
}
