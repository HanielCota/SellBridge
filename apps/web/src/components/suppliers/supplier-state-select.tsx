import { MapPinIcon } from "@phosphor-icons/react";
import {
  BRAZILIAN_STATE_NAMES,
  BRAZILIAN_STATES,
  type BrazilianState,
  stateSchema,
} from "@sellbridge/shared/brazilian-states";
import { BrazilFlag } from "@/components/icons/brazil-flag";
import { StateFlag } from "@/components/icons/state-flags";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** The option that clears the state filter. */
export const ALL_STATES = "__all__";

const ALL_STATES_LABEL = "Todo o Brasil";

/** The flag of the chosen state, Brazil's for every state, a pin for a code it doesn't know. */
function StateIcon({ state }: { state: string }) {
  if (state === ALL_STATES) {
    return <BrazilFlag aria-hidden="true" className="size-4 shrink-0" />;
  }
  const parsedState = stateSchema.safeParse(state);
  if (!parsedState.success) {
    return <MapPinIcon aria-hidden="true" className="shrink-0" />;
  }
  return <StateFlag state={parsedState.data} aria-hidden="true" className="size-4 shrink-0" />;
}

/**
 * Every state, by name, even the ones without suppliers yet: a reseller looks for their own
 * state, and a missing one reads as a broken list. An empty one shows the empty state.
 */
export const STATE_OPTIONS: readonly BrazilianState[] = BRAZILIAN_STATES.toSorted((first, second) =>
  BRAZILIAN_STATE_NAMES[first].localeCompare(BRAZILIAN_STATE_NAMES[second], "pt-BR"),
);

/** "Roraima" for RR; "Todo o Brasil" for the cleared filter; the raw code for anything else. */
export function stateLabel(state: string): string {
  if (state === ALL_STATES) {
    return ALL_STATES_LABEL;
  }
  const parsedState = stateSchema.safeParse(state);
  return parsedState.success ? BRAZILIAN_STATE_NAMES[parsedState.data] : state;
}

/** The state a supplier ships from, as the onboarding and the suppliers page filter it. */
export function SupplierStateSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (state: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn("min-w-0 justify-start [&>svg:last-child]:ml-auto", className)}
        aria-label="Estado do fornecedor"
      >
        <StateIcon state={value} />
        <SelectValue>
          <span className="truncate">{stateLabel(value)}</span>
        </SelectValue>
      </SelectTrigger>
      {/*
        Below the trigger, not over it: the item-aligned default lined the checked item up with
        the trigger and covered it, so "Todo o Brasil" opened as a broken card on top of the field.
      */}
      <SelectContent position="popper" align="start" className="max-h-80 min-w-60">
        <SelectItem value={ALL_STATES}>
          <StateIcon state={ALL_STATES} />
          {ALL_STATES_LABEL}
        </SelectItem>
        {STATE_OPTIONS.map((state) => (
          <SelectItem key={state} value={state}>
            <StateIcon state={state} />
            <span className="flex-1">{BRAZILIAN_STATE_NAMES[state]}</span>
            <span className="text-muted-foreground tabular-nums">{state}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
