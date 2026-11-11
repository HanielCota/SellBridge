import { type ComponentProps, useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A labelled text field; the rest of the input's attributes (autocomplete, keyboard) pass through. */
export function Field({
  label,
  value,
  onChange,
  error = null,
  hint = null,
  id,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Shown under the field after an action that needs it, announced to screen readers. */
  error?: string | null;
  /** A line of help under the field (what to type, what a lookup found), announced politely. */
  hint?: string | null;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;
  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        {...inputProps}
        id={inputId}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={note === null ? undefined : noteId}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span id={noteId} role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
      {hint !== null && error === null ? (
        <span id={noteId} aria-live="polite" className="text-footnote text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
