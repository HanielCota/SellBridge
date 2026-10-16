import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { SectionCard } from "@/components/layout/section-card";
import { SupplierLogo } from "@/components/suppliers/supplier-logo";

interface StarterSupplier {
  name: string;
  logoUrl: string | null;
  city: string;
  state: string;
}

function StatusRow({
  label,
  done,
  children,
}: {
  label: string;
  done: boolean;
  children: ReactNode;
}) {
  const Icon = done ? CheckCircleIcon : WarningCircleIcon;
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-right text-sm font-medium">
        {children}
        <Icon
          weight="fill"
          aria-hidden="true"
          className={
            done
              ? "size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              : "size-4 shrink-0 text-amber-600 dark:text-amber-400"
          }
        />
      </dd>
    </div>
  );
}

/**
 * What the customer filled in during onboarding. The team only sees whether name and CPF were
 * informed, never the CPF itself; changing them is the customer's call.
 */
export function CustomerHolderCard({
  hasHolder,
  starterSupplier,
}: {
  hasHolder: boolean;
  starterSupplier: StarterSupplier | null;
}) {
  return (
    <SectionCard
      title="Cadastro do cliente"
      description="Nome e CPF para notas fiscais e cobranças, e o fornecedor escolhido no cadastro."
    >
      <dl className="divide-y divide-border">
        <StatusRow label="Nome e CPF" done={hasHolder}>
          {hasHolder ? "CPF informado" : "CPF pendente"}
        </StatusRow>
        <StatusRow label="Fornecedor do cadastro" done={starterSupplier !== null}>
          {starterSupplier === null ? (
            "Não escolhido"
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 text-right">
                <span className="block truncate">{starterSupplier.name}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {starterSupplier.city} - {starterSupplier.state}
                </span>
              </span>
              <SupplierLogo name={starterSupplier.name} logoUrl={starterSupplier.logoUrl} />
            </span>
          )}
        </StatusRow>
      </dl>
    </SectionCard>
  );
}
