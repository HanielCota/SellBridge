import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { PaymentPill } from "@/components/supplier-payments/supplier-payment-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { saveSignupRulesFn } from "@/features/signup-rules/signup-rules.functions";
import { signupRulesQueryOptions } from "@/features/signup-rules/signup-rules.queries";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";

function useSaveSignupRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => saveSignupRulesFn({ data: { enabled } }),
    onSuccess: async (since) => {
      toast.success(
        since === null
          ? "Desligado: o cadastro volta a aceitar fornecedor MEI e conta de recebimento no CPF."
          : "Ligado: fornecedor novo precisa ser ME, EPP ou maior.",
      );
      await queryClient.invalidateQueries({ queryKey: signupRulesQueryOptions().queryKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function SignupRulesStatus({ since }: { since: string | null }) {
  if (since === null) {
    return <PaymentPill tone="neutral">Desligado</PaymentPill>;
  }
  return (
    <PaymentPill tone="success">{`Ligado desde ${formatAbsoluteTime(new Date(since))}`}</PaymentPill>
  );
}

/** The switch position: the one being saved, else the stored one; undefined while loading. */
function shownEnabled(saving: boolean | undefined, since: string | null | undefined) {
  if (saving !== undefined) {
    return saving;
  }
  if (since === undefined) {
    return undefined;
  }
  return since !== null;
}

/**
 * Admin: the sign-up rules the supplier and reseller contracts ask for. Off until the lawyer
 * signs off the contracts; it only changes who can sign up from then on, never who already did.
 */
export function SignupRulesCard() {
  const switchId = useId();
  const query = useQuery(signupRulesQueryOptions());
  const save = useSaveSignupRules();
  const enabled = shownEnabled(save.isPending ? save.variables : undefined, query.data);
  return (
    <section
      aria-labelledby="signup-rules-title"
      className="surface-card grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="signup-rules-title" className="text-subhead font-medium">
            Regras de cadastro dos contratos
          </h2>
          {query.data === undefined ? null : <SignupRulesStatus since={query.data} />}
        </div>
        <p className="text-sm text-muted-foreground">
          Ligado, fornecedor novo precisa ser empresa ME, EPP ou maior: MEI é recusado na hora, com
          o motivo no painel dele, e a conta de recebimento só abre no CNPJ. Quem já está cadastrado
          não muda nada. Ligue quando os contratos estiverem assinados.
        </p>
      </div>
      {query.isPending ? <Skeleton className="h-11 rounded-2xl" /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {enabled === undefined ? null : (
        <div className="flex min-h-11 items-center gap-3">
          <Switch
            id={switchId}
            checked={enabled}
            disabled={save.isPending}
            onCheckedChange={(next) => save.mutate(next)}
          />
          <label htmlFor={switchId} className="text-sm font-medium">
            {save.isPending ? "Salvando…" : "Aplicar as regras de cadastro dos contratos"}
          </label>
        </div>
      )}
    </section>
  );
}
