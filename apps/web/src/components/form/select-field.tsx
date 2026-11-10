import { Label } from "@/components/ui/label";

const SELECT_CLASS =
  "h-11 w-full rounded-xl border border-field-border bg-card px-3 text-body aria-invalid:border-destructive";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/** A native select with its label, its error tied to it for screen readers and an optional hint. */
export function SelectField(props: {
  id: string;
  label: string;
  value: string;
  error: string | null;
  options: readonly SelectOption[];
  placeholder?: string;
  hint?: string;
  onValueChange: (value: string) => void;
}) {
  const errorId = `${props.id}-error`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <select
        id={props.id}
        className={SELECT_CLASS}
        value={props.value}
        aria-invalid={props.error === null ? undefined : true}
        aria-describedby={props.error === null ? undefined : errorId}
        onChange={(event) => props.onValueChange(event.target.value)}
      >
        {props.placeholder === undefined ? null : <option value="">{props.placeholder}</option>}
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {props.error === null ? null : (
        <p id={errorId} className="text-sm text-destructive">
          {props.error}
        </p>
      )}
      {props.hint === undefined ? null : (
        <p className="text-footnote text-muted-foreground">{props.hint}</p>
      )}
    </div>
  );
}
