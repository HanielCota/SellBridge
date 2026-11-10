import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/**
 * The app's own select with its label, its error tied to it for screen readers and an optional
 * hint. An empty value shows the placeholder.
 */
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
      <Select value={props.value} onValueChange={props.onValueChange}>
        <SelectTrigger
          id={props.id}
          className="w-full min-w-0 aria-invalid:border-destructive"
          aria-invalid={props.error === null ? undefined : true}
          aria-describedby={props.error === null ? undefined : errorId}
        >
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="max-h-80">
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
