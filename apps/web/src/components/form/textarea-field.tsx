import type { ComponentProps } from "react";
import { firstErrorMessage } from "@/components/form/form-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HintedText } from "@/components/ui/hint";

interface TextareaFieldProps extends Omit<
  ComponentProps<typeof Textarea>,
  "id" | "onChange" | "value"
> {
  id: string;
  label: string;
  /** A legend on the label, opened on hover or tap (the label stays the field's name). */
  hint?: string | undefined;
  value: string;
  errors: readonly unknown[];
  onValueChange: (value: string) => void;
}

/** Multi-line counterpart of `TextField`: label, textarea and an accessible error message. */
export function TextareaField({
  id,
  label,
  hint,
  value,
  errors,
  onValueChange,
  ...textareaProps
}: TextareaFieldProps) {
  const message = firstErrorMessage(errors);
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {hint === undefined ? (
          label
        ) : (
          <HintedText label={hint} focusable={false} className="hinted-term">
            {label}
          </HintedText>
        )}
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? errorId : undefined}
        {...textareaProps}
      />
      {message ? (
        <p id={errorId} className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
