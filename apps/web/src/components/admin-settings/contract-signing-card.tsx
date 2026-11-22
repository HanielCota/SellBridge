import { CONTRACT_SIGNING_GRACE_DAYS } from "@sellbridge/shared/contract-documents";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { PaymentPill } from "@/components/supplier-payments/supplier-payment-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { ContractSigningSettingsView } from "@/features/contract-signing/contract-signing-settings.server";
import { saveContractSigningSettingsFn } from "@/features/contract-signing/contract-signing.functions";
import { contractSigningSettingsQueryOptions } from "@/features/contract-signing/contract-signing.queries";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";

function useSaveSwitch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (required: boolean) => saveContractSigningSettingsFn({ data: { required } }),
    onSuccess: async (saved) => {
      toast.success(
        saved.required
          ? "Salvo: a assinatura do contrato passou a ser pedida."
          : "Salvo: a assinatura do contrato está desligada.",
      );
      await queryClient.invalidateQueries({
        queryKey: contractSigningSettingsQueryOptions().queryKey,
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function profilesPhrase(total: number, one: string, many: string): string {
  return total === 1 ? `1 ${one}` : `${total} ${many}`;
}

/** What saving changes, written before the click. */
function Consequence({ view, required }: { view: ContractSigningSettingsView; required: boolean }) {
  const sellers = profilesPhrase(view.sellersWithoutSignature, "vendedor", "vendedores");
  const suppliers = profilesPhrase(view.suppliersWithoutSignature, "fornecedor", "fornecedores");
  const lines = required
    ? [
        "Quem criar conta a partir de agora assina antes de usar o painel.",
        `${sellers} e ${suppliers} sem assinatura ganham ${CONTRACT_SIGNING_GRACE_DAYS} dias, com um aviso no topo do painel.`,
        `Depois dos ${CONTRACT_SIGNING_GRACE_DAYS} dias, o vendedor só entra assinando.`,
      ]
    : [
        "Ninguém mais vê a tela de assinatura nem o aviso. As assinaturas já feitas ficam guardadas.",
      ];
  return (
    <div className="grid gap-1 rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
      <p className="font-medium">Ao salvar:</p>
      <ul className="grid list-disc gap-1 pl-5">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function SwitchForm({ view }: { view: ContractSigningSettingsView }) {
  const switchId = useId();
  const [required, setRequired] = useState(view.required);
  const save = useSaveSwitch();
  const changed = required !== view.required;
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <div className="flex min-h-11 items-center gap-3">
          <Switch
            id={switchId}
            checked={required}
            aria-describedby={`${switchId}-hint`}
            onCheckedChange={setRequired}
          />
          <label htmlFor={switchId} className="text-sm font-medium">
            Pedir a assinatura do contrato
          </label>
        </div>
        <p id={`${switchId}-hint`} className="pl-14 text-footnote text-muted-foreground">
          Vendedores e fornecedores leem o resumo, marcam cada ponto e assinam com um código enviado
          ao e-mail. Ligue só quando o advogado liberar o texto final.
        </p>
      </div>
      {changed ? <Consequence view={view} required={required} /> : null}
      <div>
        <Button
          size="lg"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate(required)}
        >
          {save.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

function SwitchStatus({ view }: { view: ContractSigningSettingsView }) {
  if (view.requiredSince === null) {
    return <PaymentPill tone="neutral">Desligada</PaymentPill>;
  }
  return (
    <PaymentPill tone="success">
      {`Ligada · desde ${formatAbsoluteTime(new Date(view.requiredSince))}`}
    </PaymentPill>
  );
}

/** Admin: the switch that asks every profile to sign its contract (contracts, section 1). */
export function ContractSigningCard() {
  const query = useQuery(contractSigningSettingsQueryOptions());
  return (
    <section
      aria-labelledby="contract-signing-title"
      className="surface-card grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="contract-signing-title" className="text-subhead font-medium">
            Assinatura do contrato
          </h2>
          {query.data === undefined ? null : <SwitchStatus view={query.data} />}
        </div>
        <p className="text-sm text-muted-foreground">
          Os textos ainda são provisórios. Veja como estão:{" "}
          <Link to="/contrato/vendedor" target="_blank" className="underline underline-offset-2">
            contrato de vendedor
          </Link>{" "}
          e{" "}
          <Link to="/contrato/fornecedor" target="_blank" className="underline underline-offset-2">
            contrato de fornecedor
          </Link>
          .
        </p>
      </div>
      {query.isPending ? <Skeleton className="h-32 rounded-2xl" /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data === undefined ? null : (
        <SwitchForm key={String(query.data.required)} view={query.data} />
      )}
    </section>
  );
}
