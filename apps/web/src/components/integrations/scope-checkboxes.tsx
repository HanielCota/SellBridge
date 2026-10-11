import { API_SCOPE_LABELS, API_SCOPES, type ApiScope } from "@sellbridge/shared/public-api";
import { firstErrorMessage } from "@/components/form/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const READ_SCOPES = API_SCOPES.filter((scope) => scope.endsWith(":read"));
const WRITE_SCOPES = API_SCOPES.filter((scope) => !scope.endsWith(":read"));

const SCOPE_GROUPS = [
  { title: "Leitura", scopes: READ_SCOPES },
  { title: "Escrita e gerenciamento", scopes: WRITE_SCOPES },
] as const;

interface ScopeCheckboxesProps {
  value: readonly ApiScope[];
  errors: readonly unknown[];
  onChange: (scopes: ApiScope[]) => void;
}

function toggled(value: readonly ApiScope[], scope: ApiScope, checked: boolean): ApiScope[] {
  const others = value.filter((current) => current !== scope);
  if (!checked) {
    return others;
  }
  // Keeps the catalog order, so the submitted list reads the same as the screen.
  return API_SCOPES.filter((current) => current === scope || others.includes(current));
}

function ScopeOption({
  scope,
  checked,
  onCheckedChange,
}: {
  scope: ApiScope;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = `api-key-scope-${scope.replace(":", "-")}`;
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(state) => onCheckedChange(state === true)}
        className="mt-0.5"
      />
      <div className="grid min-w-0 gap-1">
        <Label htmlFor={id} className="leading-snug">
          {API_SCOPE_LABELS[scope]}
        </Label>
        <code className="text-xs text-muted-foreground">{scope}</code>
      </div>
    </div>
  );
}

/** What the key may do, read and write apart so write access is a conscious choice. */
export function ScopeCheckboxes({ value, errors, onChange }: ScopeCheckboxesProps) {
  const message = firstErrorMessage(errors);
  return (
    <fieldset
      className="grid gap-4"
      aria-describedby={message ? "api-key-scopes-error" : undefined}
    >
      <legend className="mb-3 text-sm font-medium">Permissões</legend>
      {SCOPE_GROUPS.map((group) => (
        <div key={group.title} className="grid gap-3">
          <p className="text-footnote text-muted-foreground">{group.title}</p>
          {group.scopes.map((scope) => (
            <ScopeOption
              key={scope}
              scope={scope}
              checked={value.includes(scope)}
              onCheckedChange={(checked) => onChange(toggled(value, scope, checked))}
            />
          ))}
        </div>
      ))}
      {message ? (
        <p id="api-key-scopes-error" className="text-footnote text-destructive">
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}
