import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { PaymentPill } from "@/components/supplier-payments/supplier-payment-badge";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { requireReceivingAccountConsequence } from "@/features/supplier-approval/require-receiving-account-copy";
import { saveRequireReceivingAccountFn } from "@/features/supplier-approval/approval.functions";
import { requireReceivingAccountQueryOptions } from "@/features/supplier-approval/approval.queries";
import { errorMessage } from "@/lib/errors";

interface RequirementView {
  required: boolean;
  asaasAvailable: boolean;
}

function useSaveRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (required: boolean) => saveRequireReceivingAccountFn({ data: { required } }),
    onSuccess: async (required) => {
      toast.success(
        required
          ? "Salvo: fornecedor novo só é aprovado com a conta de recebimento aprovada."
          : "Salvo: fornecedor novo é aprovado só com o CNPJ ativo.",
      );
      await queryClient.invalidateQueries({
        queryKey: requireReceivingAccountQueryOptions().queryKey,
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** Like "Recebimento pelo SellBridge": the switch only marks, the button saves after "Ao salvar:". */
function RequirementForm({ view }: { view: RequirementView }) {
  const switchId = useId();
  const [chosen, setChosen] = useState(view.required);
  const save = useSaveRequirement();
  const consequence = requireReceivingAccountConsequence({ saved: view.required, chosen });
  // Turning off always works; turning on needs Asaas configured on the server.
  const cannotTurnOn = !view.asaasAvailable;
  return (
    <div className="grid gap-4">
      {cannotTurnOn ? (
        <p className="text-sm">
          O Asaas ainda não está ligado no SellBridge. Esta regra só pode ser ligada depois disso.
        </p>
      ) : null}
      <div className="flex min-h-11 items-center gap-3">
        <Switch
          id={switchId}
          checked={chosen}
          disabled={save.isPending || (cannotTurnOn && !chosen)}
          onCheckedChange={setChosen}
        />
        <label htmlFor={switchId} className="text-sm font-medium">
          Exigir conta de recebimento para aprovar
        </label>
      </div>
      {consequence === null ? null : (
        <div className="grid gap-1 rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-medium">Ao salvar:</p>
          <p>{consequence}</p>
        </div>
      )}
      <div>
        <Button
          size="lg"
          disabled={consequence === null || save.isPending}
          onClick={() => save.mutate(chosen)}
        >
          {save.isPending ? "Salvando…" : "Salvar regra"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Admin: whether a supplier who signs up alone also needs an approved receiving account to be
 * approved. Off until Asaas runs in production; otherwise no new supplier would ever pass.
 */
export function RequireReceivingAccountCard() {
  const query = useQuery(requireReceivingAccountQueryOptions());
  return (
    <section
      aria-labelledby="require-receiving-account-title"
      className="surface-card grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="require-receiving-account-title" className="text-subhead font-medium">
            Aprovação de fornecedor novo
          </h2>
          {query.data === undefined ? null : (
            <PaymentPill tone={query.data.required ? "success" : "neutral"}>
              {query.data.required ? "Exige conta de recebimento" : "Só o CNPJ"}
            </PaymentPill>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Quem se cadastra sozinho como fornecedor é aprovado quando o CNPJ está ativo na Receita.
          Ligado, também precisa da conta de recebimento aprovada no Asaas. Ligue só quando o Asaas
          estiver funcionando: sem ele, nenhum fornecedor novo é aprovado.
        </p>
      </div>
      {query.isPending ? <Skeleton className="h-11 rounded-2xl" /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data === undefined ? null : (
        <RequirementForm key={String(query.data.required)} view={query.data} />
      )}
    </section>
  );
}
