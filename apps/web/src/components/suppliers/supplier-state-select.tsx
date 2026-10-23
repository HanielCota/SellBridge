import { MapPinIcon } from "@phosphor-icons/react";
import { BRAZILIAN_STATES, stateSchema } from "@sellbridge/shared/brazilian-states";
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
    return <BrazilFlag aria-hidden="true" className="size-4" />;
  }
  const parsedState = stateSchema.safeParse(state);
  if (!parsedState.success) {
    return <MapPinIcon aria-hidden="true" />;
  }
  return <StateFlag state={parsedState.data} aria-hidden="true" className="size-4" />;
}

/**
 * Every state, in alphabetical order, even the ones without suppliers yet: a reseller looks for
 * their own state, and a missing one reads as a broken list. An empty one shows the empty state.
 */
export const STATE_OPTIONS: readonly string[] = BRAZILIAN_STATES.toSorted((first, second) =>
  first.localeCompare(second),
);

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
  const isAllStates = value === ALL_STATES;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn("justify-start [&>svg:last-child]:ml-auto", className)}
        aria-label="Estado do fornecedor"
      >
        <StateIcon state={value} />
        <SelectValue>{isAllStates ? ALL_STATES_LABEL : value}</SelectValue>
      </SelectTrigger>
      {/*
        Below the trigger, not over it: the item-aligned default lines the checked item up with
        the trigger text, and the leading icon pushed the list over the trigger itself.
      */}
      <SelectContent position="popper" align="start">
        <SelectItem value={ALL_STATES}>
          <StateIcon state={ALL_STATES} />
          {ALL_STATES_LABEL}
        </SelectItem>
        {STATE_OPTIONS.map((state) => (
          <SelectItem key={state} value={state}>
            <StateIcon state={state} />
            {state}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
