import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { PaymentPill } from "@/components/supplier-payments/supplier-payment-badge";
import { Button } from "@/components/ui/button";
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

/** What saving changes, written before the click. */
function Consequence({ enabled }: { enabled: boolean }) {
  const lines = enabled
    ? [
        "Fornecedor novo que for MEI é recusado na hora, com o motivo no painel dele.",
        "A conta de recebimento de fornecedor novo só abre no CNPJ.",
        "Quem já está cadastrado continua como está.",
      ]
    : ["O cadastro volta a aceitar fornecedor MEI e conta de recebimento no CPF."];
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

function SignupRulesForm({ storedEnabled }: { storedEnabled: boolean }) {
  const switchId = useId();
  const [enabled, setEnabled] = useState(storedEnabled);
  const save = useSaveSignupRules();
  const changed = enabled !== storedEnabled;
  return (
    <div className="grid gap-4">
      <div className="flex min-h-11 items-center gap-3">
        <Switch id={switchId} checked={enabled} onCheckedChange={setEnabled} />
        <label htmlFor={switchId} className="text-sm font-medium">
          Aplicar as regras de cadastro dos contratos
        </label>
      </div>
      {changed ? <Consequence enabled={enabled} /> : null}
      <div>
        <Button
          size="lg"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate(enabled)}
        >
          {save.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Admin: the sign-up rules the supplier and reseller contracts ask for. Off until the lawyer
 * signs off the contracts; it only changes who can sign up from then on, never who already did.
 */
export function SignupRulesCard() {
  const query = useQuery(signupRulesQueryOptions());
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
      {query.data === undefined ? null : (
        <SignupRulesForm key={String(query.data)} storedEnabled={query.data !== null} />
      )}
    </section>
  );
}
