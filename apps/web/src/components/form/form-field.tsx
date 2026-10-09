import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Extracts a readable message from TanStack Form errors (Standard Schema issues or strings). */
export function firstErrorMessage(errors: readonly unknown[]): string | null {
  const [first] = errors;
  if (first === undefined || first === null) {
    return null;
  }
  if (typeof first === "string") {
    return first;
  }
  if (typeof first === "object" && "message" in first && typeof first.message === "string") {
    return first.message;
  }
  return "Valor inválido";
}

interface TextFieldProps extends Omit<ComponentProps<typeof Input>, "id" | "onChange" | "value"> {
  id: string;
  label: string;
  value: string;
  errors: readonly unknown[];
  onValueChange: (value: string) => void;
}

export function TextField({
  id,
  label,
  value,
  errors,
  onValueChange,
  ...inputProps
}: TextFieldProps) {
  const message = firstErrorMessage(errors);
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? errorId : undefined}
        {...inputProps}
      />
      {message ? (
        <p id={errorId} className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
