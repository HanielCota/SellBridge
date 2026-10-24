import {
  BRAZILIAN_STATE_NAMES,
  BRAZILIAN_STATES,
  stateLabel,
  stateSchema,
  type BrazilianState,
} from "@sellbridge/shared/brazilian-states";
import { CaretDownIcon } from "@phosphor-icons/react";
import { Select as SelectPrimitive } from "radix-ui";
import { StateFlag } from "@/components/icons/state-flags";
import { SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { firstErrorMessage } from "./form-field";

interface FloatingStateSelectProps {
  id: string;
  label: string;
  value: string;
  errors: readonly unknown[];
  onValueChange: (value: string) => void;
  onBlur?: (() => void) | undefined;
  /** Autofill token, e.g. "address-level1"; it lands on the hidden native select. */
  autoComplete?: string | undefined;
}

function chosenState(value: string): BrazilianState | null {
  const parsed = stateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function StateOption({ state }: { state: BrazilianState }) {
  return (
    <SelectItem value={state} textValue={BRAZILIAN_STATE_NAMES[state]} className="gap-2.5 py-2">
      <StateFlag state={state} aria-hidden="true" className="size-5" />
      <span className="truncate text-foreground">{BRAZILIAN_STATE_NAMES[state]}</span>
      <span className="text-muted-foreground tabular-nums">({state})</span>
    </SelectItem>
  );
}

/** The closed field: label on top, the chosen state's flag and "Name (UF)" below it. */
function StateTrigger({
  id,
  label,
  state,
  message,
}: {
  id: string;
  label: string;
  state: BrazilianState | null;
  message: string | null;
}) {
  return (
    <div className="relative">
      <SelectPrimitive.Trigger
        id={id}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? `${id}-footnote` : undefined}
        className={cn(
          "relative flex h-14 w-full cursor-pointer items-end gap-2 rounded-xl border border-field-border bg-field pr-9 pb-2 pl-4 text-left text-body tracking-tight text-foreground transition-[border-color,box-shadow] duration-150 outline-none",
          "focus-visible:border-brand-strong focus-visible:ring-4 focus-visible:ring-brand/20 data-[state=open]:border-brand-strong data-[state=open]:ring-4 data-[state=open]:ring-brand/20",
          "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/15",
        )}
      >
        {state === null ? null : (
          <StateFlag state={state} aria-hidden="true" className="mb-0.5 size-[18px] shrink-0" />
        )}
        <span className={cn("min-w-0 truncate", state === null ? "text-muted-foreground" : null)}>
          <SelectPrimitive.Value placeholder="Escolha">
            {state === null ? null : stateLabel(state)}
          </SelectPrimitive.Value>
        </span>
        <CaretDownIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </SelectPrimitive.Trigger>
      <label
        htmlFor={id}
        className="pointer-events-none absolute top-[1.15rem] left-4 -translate-y-1/2 text-xs text-muted-foreground"
      >
        {label}
      </label>
    </div>
  );
}

/**
 * The state in the floating field's shape, listed by name with its flag ("Roraima (RR)"): the
 * two-letter code alone is easy to mistake (AM, AP, AL). Drawn by the app instead of the OS, so
 * the open list matches the form in both themes. Typing a letter jumps to the state's name.
 */
export function FloatingStateSelect({
  id,
  label,
  value,
  errors,
  onValueChange,
  onBlur,
  autoComplete,
}: FloatingStateSelectProps) {
  const message = firstErrorMessage(errors);
  const footnoteId = `${id}-footnote`;
  const state = chosenState(value);
  return (
    <div className="grid gap-1.5">
      <SelectPrimitive.Root
        value={value}
        onValueChange={onValueChange}
        onOpenChange={(isOpen) => (isOpen ? undefined : onBlur?.())}
        autoComplete={autoComplete}
      >
        <StateTrigger id={id} label={label} state={state} message={message} />
        {/*
          Below the field and wider than it: a narrow column cut "Rio Grande do Norte". The list
          scrolls by wheel, touch or keys; Radix hides the bar and shows a caret at each edge.
        */}
        <SelectContent
          position="popper"
          align="start"
          sideOffset={6}
          className="max-h-[min(22rem,var(--radix-select-content-available-height))] w-72 max-w-[calc(100vw-2rem)]"
        >
          {BRAZILIAN_STATES.map((option) => (
            <StateOption key={option} state={option} />
          ))}
        </SelectContent>
      </SelectPrimitive.Root>
      {message ? (
        <p id={footnoteId} className="px-1 text-footnote text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
