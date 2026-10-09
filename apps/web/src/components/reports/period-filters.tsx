import {
  PERIOD_LABELS,
  PERIOD_PRESETS,
  type PeriodPreset,
  type PeriodSearch,
} from "@sellbridge/shared/schemas";
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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="period">Período</Label>
        <Select
          value={search.period}
          onValueChange={(value) => {
            const period = PERIOD_PRESETS.find((preset) => preset === value);
            if (!period) {
              return;
            }
            onChange(
              period === "custom"
                ? { period, from: resolvedFrom, to: resolvedTo }
                : { period, from: undefined, to: undefined },
            );
          }}
        >
          <SelectTrigger id="period" className="w-full lg:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_PRESETS.map((preset: PeriodPreset) => (
              <SelectItem key={preset} value={preset}>
                {PERIOD_LABELS[preset]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {search.period === "custom" ? (
        <CustomRange
          key={`${resolvedFrom}-${resolvedTo}`}
          from={resolvedFrom}
          to={resolvedTo}
          onApply={(from, to) => onChange({ period: "custom", from, to })}
        />
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="store">Loja</Label>
        <Select
          value={search.store ?? ALL_STORES}
          onValueChange={(value) => onChange({ store: value === ALL_STORES ? undefined : value })}
        >
          <SelectTrigger id="store" className="w-full lg:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STORES}>Todas as lojas</SelectItem>
            {stores.map((store) => (
              <SelectItem key={store.id} value={store.id}>
                {store.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
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
    <div className="flex items-end gap-2">
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
