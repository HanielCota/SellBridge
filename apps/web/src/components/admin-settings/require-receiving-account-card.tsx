import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { toast } from "sonner";
import { ToneStatus } from "@/components/data/tone-status";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { saveRequireReceivingAccountFn } from "@/features/supplier-approval/approval.functions";
import { requireReceivingAccountQueryOptions } from "@/features/supplier-approval/approval.queries";
import { errorMessage } from "@/lib/errors";

function useSaveRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (required: boolean) => saveRequireReceivingAccountFn({ data: { required } }),
    onSuccess: async (required) => {
      toast.success(
        required
          ? "Ligado: fornecedor novo só é aprovado com a conta de recebimento aprovada."
          : "Desligado: fornecedor novo é aprovado só com o CNPJ ativo.",
      );
      await queryClient.invalidateQueries({
        queryKey: requireReceivingAccountQueryOptions().queryKey,
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/**
 * Admin: whether a supplier who signs up alone also needs an approved receiving account to be
 * approved. Off until Asaas runs in production; otherwise no new supplier would ever pass.
 */
export function RequireReceivingAccountCard() {
  const switchId = useId();
  const query = useQuery(requireReceivingAccountQueryOptions());
  const save = useSaveRequirement();
  const required = save.isPending ? save.variables : query.data;
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
            <ToneStatus
              tone={query.data ? "success" : "muted"}
              label={query.data ? "Exige conta de recebimento" : "Só o CNPJ"}
            />
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
      {required === undefined ? null : (
        <div className="flex min-h-11 items-center gap-3">
          <Switch
            id={switchId}
            checked={required}
            disabled={save.isPending}
            onCheckedChange={(next) => save.mutate(next)}
          />
          <label htmlFor={switchId} className="text-sm font-medium">
            {save.isPending ? "Salvando…" : "Exigir conta de recebimento para aprovar"}
          </label>
        </div>
      )}
    </section>
  );
}
