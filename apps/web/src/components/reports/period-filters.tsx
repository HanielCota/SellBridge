import { PERIOD_PRESETS, type PeriodPreset, type PeriodSearch } from "@sellbridge/shared/schemas";
import { cn } from "cn";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_STORES = "__all__";

/** Short labels for the segmented control (the long ones live in PERIOD_LABELS). */
const SEGMENT_LABELS: Record<PeriodPreset, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  "180d": "6 meses",
  custom: "Personalizado",
};

interface PeriodFiltersProps {
  search: PeriodSearch;
  stores: { id: string; name: string }[];
  resolvedFrom: string;
  resolvedTo: string;
  onChange: (patch: Partial<PeriodSearch>) => void;
}

export function PeriodFilters({
  search,
  stores,
  resolvedFrom,
  resolvedTo,
  onChange,
}: PeriodFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodSegments
          period={search.period}
          onPeriodChange={(period) =>
            onChange(
              period === "custom"
                ? { period, from: resolvedFrom, to: resolvedTo }
                : { period, from: undefined, to: undefined },
            )
          }
        />
        <StoreSelect
          store={search.store}
          stores={stores}
          onStoreChange={(store) => onChange({ store })}
        />
      </div>
      {search.period === "custom" ? (
        <CustomRange
          key={`${resolvedFrom}-${resolvedTo}`}
          from={resolvedFrom}
          to={resolvedTo}
          onApply={(from, to) => onChange({ period: "custom", from, to })}
        />
      ) : null}
    </div>
  );
}

/** One-click period choice: native radios styled as a segmented control. */
function PeriodSegments({
  period,
  onPeriodChange,
}: {
  period: PeriodSearch["period"];
  onPeriodChange: (period: PeriodPreset) => void;
}) {
  return (
    <fieldset className="flex w-full rounded-lg bg-muted p-0.5 sm:inline-flex sm:w-auto">
      <legend className="sr-only">Período</legend>
      {PERIOD_PRESETS.map((preset) => (
        <label
          key={preset}
          className={cn(
            "flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:flex-none sm:px-3 sm:text-[13px]",
            "has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm",
            "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          )}
        >
          <input
            type="radio"
            name="period"
            value={preset}
            checked={preset === period}
            onChange={() => onPeriodChange(preset)}
            className="sr-only"
          />
          {SEGMENT_LABELS[preset]}
        </label>
      ))}
    </fieldset>
  );
}

function StoreSelect({
  store,
  stores,
  onStoreChange,
}: {
  store: PeriodSearch["store"];
  stores: PeriodFiltersProps["stores"];
  onStoreChange: (store: string | undefined) => void;
}) {
  return (
    <Select
      value={store ?? ALL_STORES}
      onValueChange={(value) => onStoreChange(value === ALL_STORES ? undefined : value)}
    >
      <SelectTrigger aria-label="Loja" className="h-9 w-full min-w-44 sm:w-auto">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_STORES}>Todas as lojas</SelectItem>
        {stores.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CustomRange({
  from,
  to,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}) {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const invalid = start.length === 0 || end.length === 0 || end < start;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <Label htmlFor="from">De</Label>
        <Input
          id="from"
          type="date"
          value={start}
          max={end}
          onChange={(event) => setStart(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="to">Até</Label>
        <Input
          id="to"
          type="date"
          value={end}
          min={start}
          onChange={(event) => setEnd(event.target.value)}
        />
      </div>
      <Button variant="outline" disabled={invalid} onClick={() => onApply(start, end)}>
        Aplicar
      </Button>
    </div>
  );
}
