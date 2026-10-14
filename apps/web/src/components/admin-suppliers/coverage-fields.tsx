import { BRAZILIAN_STATES } from "@sellbridge/shared/cep";
import { TextField } from "@/components/form/form-field";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CoverageDraft } from "@/features/admin-suppliers/form-values";

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
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BRAZILIAN_STATES.map((state) => (
            <SelectItem key={state} value={state}>
              {state}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CoverageFields({
  values,
  onChange,
}: {
  values: CoverageDraft[];
  onChange: (values: CoverageDraft[]) => void;
}) {
  function update(index: number, change: Partial<CoverageDraft>) {
    onChange(
      values.map((region, position) => (position === index ? { ...region, ...change } : region)),
    );
  }
  return (
    <fieldset className="space-y-3">
      <legend className="font-medium">Cobertura de atendimento</legend>
      <p className="text-sm text-muted-foreground">
        Deixe a cidade vazia para atender toda a UF. Adicione uma região por cidade.
      </p>
      {values.map((region, index) => (
        <div key={index} className="grid items-end gap-3 sm:grid-cols-[6rem_1fr_auto]">
          <StateField
            id={`coverage-state-${index}`}
            label="UF"
            value={region.state}
            onChange={(state) => update(index, { state })}
          />
          <TextField
            id={`coverage-city-${index}`}
            label="Cidade (opcional)"
            value={region.city}
            errors={[]}
            onValueChange={(city) => update(index, { city })}
            maxLength={120}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={values.length === 1}
            onClick={() => onChange(values.filter((_, position) => position !== index))}
            aria-label={`Remover região ${index + 1}`}
          >
            Remover
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={values.length >= 200}
        onClick={() => onChange([...values, { state: "SP", city: "" }])}
      >
        Adicionar região
      </Button>
    </fieldset>
  );
}
