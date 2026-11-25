import {
  DEVELOPER_SCOPE_LABELS,
  DEVELOPER_SCOPES,
  type DeveloperScope,
  ENTRY_LINK_SCOPE,
  PERSONAL_DATA_REQUIRES,
  PERSONAL_DATA_SCOPE,
} from "@sellbridge/shared/developer-api";
import { firstErrorMessage } from "@/components/form/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const DATA_SCOPES = DEVELOPER_SCOPES.filter(
  (scope) => scope !== PERSONAL_DATA_SCOPE && scope !== ENTRY_LINK_SCOPE,
);

interface DeveloperScopeCheckboxesProps {
  value: readonly DeveloperScope[];
  errors: readonly unknown[];
  onChange: (scopes: DeveloperScope[]) => void;
}

/**
 * Keeps the catalog order, and drops the buyer's personal data together with orders, since it
 * only travels inside them.
 */
export function toggledDeveloperScopes(
  value: readonly DeveloperScope[],
  scope: DeveloperScope,
  checked: boolean,
): DeveloperScope[] {
  const others = value.filter((current) => current !== scope);
  const kept =
    !checked && scope === PERSONAL_DATA_REQUIRES
      ? others.filter((current) => current !== PERSONAL_DATA_SCOPE)
      : others;
  if (!checked) {
    return kept;
  }
  return DEVELOPER_SCOPES.filter((current) => current === scope || kept.includes(current));
}

function ScopeOption({
  scope,
  checked,
  disabled,
  hint,
  onCheckedChange,
}: {
  scope: DeveloperScope;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = `developer-scope-${scope.replace(":", "-")}`;
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onCheckedChange={(state) => onCheckedChange(state === true)}
        className="mt-0.5"
      />
      <div className="grid min-w-0 gap-1">
        <Label htmlFor={id} className="leading-snug">
          {DEVELOPER_SCOPE_LABELS[scope]}
        </Label>
        <code className="text-xs text-muted-foreground">{scope}</code>
        {hint ? (
          <p id={`${id}-hint`} className="text-footnote text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * What the key may read, with the buyer's personal data and the one thing it may create (entry
 * links) as separate choices.
 */
export function DeveloperScopeCheckboxes({
  value,
  errors,
  onChange,
}: DeveloperScopeCheckboxesProps) {
  const message = firstErrorMessage(errors);
  const hasOrders = value.includes(PERSONAL_DATA_REQUIRES);
  return (
    <fieldset
      className="grid gap-4"
      aria-describedby={message ? "developer-scopes-error" : undefined}
    >
      <legend className="mb-3 text-sm font-medium">O que a chave pode ler</legend>
      <div className="grid gap-3">
        <p className="text-footnote text-muted-foreground">De todas as organizações</p>
        {DATA_SCOPES.map((scope) => (
          <ScopeOption
            key={scope}
            scope={scope}
            checked={value.includes(scope)}
            onCheckedChange={(checked) => onChange(toggledDeveloperScopes(value, scope, checked))}
          />
        ))}
      </div>
      <div className="grid gap-3 rounded-2xl bg-muted/60 p-4">
        <p className="text-footnote text-muted-foreground">Dados pessoais</p>
        <ScopeOption
          scope={PERSONAL_DATA_SCOPE}
          checked={value.includes(PERSONAL_DATA_SCOPE)}
          disabled={!hasOrders}
          hint={
            hasOrders
              ? "Marque só se o projeto precisa entregar ou emitir nota. Sem isso, o pedido traz só o nome do comprador."
              : "Marque “Pedidos” primeiro: o endereço de entrega vem dentro dos pedidos."
          }
          onCheckedChange={(checked) =>
            onChange(toggledDeveloperScopes(value, PERSONAL_DATA_SCOPE, checked))
          }
        />
      </div>
      <div className="grid gap-3 rounded-2xl bg-muted/60 p-4">
        <p className="text-footnote text-muted-foreground">O que a chave pode criar</p>
        <ScopeOption
          scope={ENTRY_LINK_SCOPE}
          checked={value.includes(ENTRY_LINK_SCOPE)}
          hint="Marque só se o outro projeto manda pessoas para o SellBridge. O link leva ao cadastro ou à entrada com os produtos escolhidos; não muda nada nas contas."
          onCheckedChange={(checked) =>
            onChange(toggledDeveloperScopes(value, ENTRY_LINK_SCOPE, checked))
          }
        />
      </div>
      {message ? (
        <p id="developer-scopes-error" className="text-footnote text-destructive">
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}
