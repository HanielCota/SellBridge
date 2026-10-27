import { BRAZILIAN_STATE_NAMES, parseState, stateLabel } from "@sellbridge/shared/brazilian-states";
import { StateFlag } from "@/components/icons/state-flags";
import { STATE_OPTIONS } from "@/components/suppliers/supplier-state-select";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STATE_LIST_CLASS_NAME = cn(
  "max-h-80 w-max",
  "[&_[data-radix-select-viewport]]:min-w-0! [&_[data-radix-select-viewport]]:[scrollbar-width:thin]!",
  "[&>[data-slot^=select-scroll]]:hidden",
);

/** "São Paulo (SP)" for a known code; the raw value for anything else. */
export function stateFieldLabel(value: string): string {
  const state = parseState(value);
  if (state === null) {
    return value;
  }
  return stateLabel(state);
}

/** The supplier's state (UF), where it ships from, picked by flag, name and code. */
export function StateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (state: string) => void;
}) {
  const chosenState = parseState(value);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full min-w-0 justify-start [&>svg:last-child]:ml-auto">
          {chosenState !== null && (
            <StateFlag state={chosenState} aria-hidden="true" className="size-4 shrink-0" />
          )}
          <SelectValue>
            <span className="truncate">{stateFieldLabel(value)}</span>
          </SelectValue>
        </SelectTrigger>
        {/*
          Below the trigger, as in SupplierStateSelect: item-aligned covered the field. As wide as
          the longest name, not the whole field, and a thin scrollbar instead of the caret buttons:
          Radix hides the viewport's scrollbar, so 27 rows gave no hint of how far the list goes.
        */}
        <SelectContent position="popper" align="start" className={STATE_LIST_CLASS_NAME}>
          {STATE_OPTIONS.map((state) => (
            <SelectItem key={state} value={state}>
              <StateFlag state={state} aria-hidden="true" className="size-4 shrink-0" />
              <span className="flex-1">{BRAZILIAN_STATE_NAMES[state]}</span>
              <span className="text-muted-foreground tabular-nums">{state}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
