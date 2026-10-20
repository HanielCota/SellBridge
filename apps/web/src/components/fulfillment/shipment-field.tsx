import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A labelled text field; the rest of the input's attributes (autocomplete, keyboard) pass through. */
export function Field({
  label,
  value,
  onChange,
  error = null,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Shown under the field after an action that needs it, announced to screen readers. */
  error?: string | null;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
  return (
    <Label className="grid gap-2">
      {label}
      <Input
        {...inputProps}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span role="alert" className="text-sm font-normal text-destructive">
          {error}
        </span>
      ) : null}
    </Label>
  );
}
