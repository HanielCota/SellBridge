import {
  API_EVENT_LABELS,
  API_EVENT_TYPES,
  type ApiEventType,
} from "@sellbridge/shared/public-api";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface EventTypeCheckboxesProps {
  value: readonly ApiEventType[];
  onChange: (types: ApiEventType[]) => void;
}

function toggled(value: readonly ApiEventType[], type: ApiEventType, checked: boolean) {
  const others = value.filter((current) => current !== type);
  if (!checked) {
    return others;
  }
  return API_EVENT_TYPES.filter((current) => current === type || others.includes(current));
}

/** Which events the endpoint receives; none checked means all, including future ones. */
export function EventTypeCheckboxes({ value, onChange }: EventTypeCheckboxesProps) {
  return (
    <fieldset className="grid gap-3" aria-describedby="webhook-events-hint">
      <legend className="mb-1 text-sm font-medium">Eventos</legend>
      <p id="webhook-events-hint" className="text-footnote text-muted-foreground">
        Sem nenhum marcado, o webhook recebe todos os eventos, inclusive os que forem criados
        depois.
      </p>
      {API_EVENT_TYPES.map((type) => {
        const id = `webhook-event-${type.replace(/[._]/g, "-")}`;
        return (
          <div key={type} className="flex items-start gap-3">
            <Checkbox
              id={id}
              checked={value.includes(type)}
              onCheckedChange={(state) => onChange(toggled(value, type, state === true))}
              className="mt-0.5"
            />
            <div className="grid min-w-0 gap-1">
              <Label htmlFor={id} className="leading-snug">
                {API_EVENT_LABELS[type]}
              </Label>
              <code className="text-xs text-muted-foreground">{type}</code>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
