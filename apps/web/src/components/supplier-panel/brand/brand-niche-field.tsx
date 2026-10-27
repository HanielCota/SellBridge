import { useState } from "react";
import { firstErrorMessage, TextField } from "@/components/form/form-field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { nicheChoice, nicheValue, OTHER_NICHE } from "@/features/supplier-panel/brand/brand-niche";

interface BrandNicheFieldProps {
  niche: string;
  categoryNames: readonly string[];
  errors: readonly string[];
  onChange: (niche: string) => void;
}

/** "O que você vende": the catalog categories, plus "Outra" with a text field for anything else. */
export function BrandNicheField({ niche, categoryNames, errors, onChange }: BrandNicheFieldProps) {
  const [selection, setSelection] = useState(() => nicheChoice(niche, categoryNames));
  const isOther = selection.choice === OTHER_NICHE;
  const message = firstErrorMessage(errors);

  function select(choice: string) {
    const next = { choice, custom: choice === OTHER_NICHE ? selection.custom : "" };
    setSelection(next);
    onChange(nicheValue(next));
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="brand-niche">O que você vende</Label>
        <Select value={selection.choice} onValueChange={select}>
          <SelectTrigger
            id="brand-niche"
            className="w-full"
            aria-invalid={message !== null && !isOther ? true : undefined}
          >
            <SelectValue placeholder="Escolha uma categoria" />
          </SelectTrigger>
          <SelectContent>
            {[...categoryNames, OTHER_NICHE].map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {message !== null && !isOther ? (
          <p className="text-sm text-destructive">{message}</p>
        ) : null}
      </div>
      {isOther ? (
        <TextField
          id="brand-niche-other"
          label="Qual categoria?"
          placeholder="Ex.: Semijoias"
          value={selection.custom}
          maxLength={100}
          errors={errors}
          onValueChange={(custom) => {
            setSelection({ choice: OTHER_NICHE, custom });
            onChange(custom);
          }}
        />
      ) : null}
    </div>
  );
}
