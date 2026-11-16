import { MAX_NEW_SUPPLIER_DELIVERIES } from "@sellbridge/shared/payment-accounts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { PaymentPill } from "@/components/supplier-payments/supplier-payment-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { saveNewSupplierRuleFn } from "@/features/supplier-payments/asaas.functions";
import { newSupplierRuleQueryOptions } from "@/features/supplier-payments/asaas.queries";
import { errorMessage } from "@/lib/errors";

/** The number typed, or why it cannot be saved, with the value in the message. */
function readDeliveries(typed: string): { deliveries: number } | { error: string } {
  const deliveries = Number(typed.trim());
  if (typed.trim() === "" || !Number.isInteger(deliveries)) {
    return { error: "Use um número inteiro de entregas, como 5." };
  }
  if (deliveries < 1 || deliveries > MAX_NEW_SUPPLIER_DELIVERIES) {
    return {
      error: `Use de 1 a ${MAX_NEW_SUPPLIER_DELIVERIES} entregas (você digitou ${deliveries}).`,
    };
  }
  return { deliveries };
}

function useSaveRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: { enabled: boolean; deliveries: number }) =>
      saveNewSupplierRuleFn({ data: value }),
    onSuccess: async (saved) => {
      toast.success(
        saved.enabled
          ? `Regra ligada: fornecedores com menos de ${saved.deliveries} entregas recebem só com proteção.`
          : "Regra desligada: todo fornecedor escolhe como recebe.",
      );
      await queryClient.invalidateQueries({ queryKey: newSupplierRuleQueryOptions().queryKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function DeliveriesField(props: {
  typed: string;
  error: string | null;
  onChange: (typed: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className="grid max-w-56 gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium">
        Até completar quantas entregas
      </label>
      <Input
        id={fieldId}
        inputMode="numeric"
        value={props.typed}
        aria-invalid={props.error === null ? undefined : true}
        aria-describedby={`${fieldId}-hint`}
        className="h-11"
        onChange={(event) => props.onChange(event.target.value)}
      />
      <p id={`${fieldId}-hint`} className="text-footnote text-muted-foreground" aria-live="polite">
        {props.error ??
          `De 1 a ${MAX_NEW_SUPPLIER_DELIVERIES}. Entregas confirmadas pelo marketplace ou pelo revendedor.`}
      </p>
    </div>
  );
}

function RuleForm({ enabled, deliveries }: { enabled: boolean; deliveries: number }) {
  const switchId = useId();
  const [isOn, setIsOn] = useState(enabled);
  const [typed, setTyped] = useState(String(deliveries));
  const read = readDeliveries(typed);
  const save = useSaveRule();
  const changed = isOn !== enabled || typed !== String(deliveries);
  return (
    <div className="grid gap-4">
      <div className="flex min-h-11 items-center gap-3">
        <Switch id={switchId} checked={isOn} onCheckedChange={setIsOn} />
        <label htmlFor={switchId} className="text-sm font-medium">
          Fornecedor novo só recebe com proteção (Asaas)
        </label>
      </div>
      <DeliveriesField
        typed={typed}
        error={"error" in read ? read.error : null}
        onChange={setTyped}
      />
      <div>
        <Button
          size="lg"
          disabled={!changed || "error" in read || save.isPending}
          onClick={() => {
            if ("deliveries" in read) {
              save.mutate({ enabled: isOn, deliveries: read.deliveries });
            }
          }}
        >
          {save.isPending ? "Salvando…" : "Salvar regra"}
        </Button>
      </div>
    </div>
  );
}

/** Admin: holds new suppliers to protected payments until they prove themselves. Off by default. */
export function NewSupplierRuleCard() {
  const query = useQuery(newSupplierRuleQueryOptions());
  return (
    <section
      aria-labelledby="new-supplier-rule-title"
      className="surface-card grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="new-supplier-rule-title" className="text-subhead font-medium">
            Proteção para fornecedores novos
          </h2>
          {query.data === undefined ? null : (
            <PaymentPill tone={query.data.enabled ? "success" : "neutral"}>
              {query.data.enabled ? `Ligada · ${query.data.deliveries} entregas` : "Desligada"}
            </PaymentPill>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Ligada, quem ainda não completou as primeiras entregas só recebe pelo Asaas: o dinheiro
          fica guardado até 7 dias depois da entrega. Depois disso, o fornecedor escolhe.
        </p>
      </div>
      {query.isPending ? <Skeleton className="h-32 rounded-2xl" /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data === undefined ? null : (
        <RuleForm
          key={`${query.data.enabled}-${query.data.deliveries}`}
          enabled={query.data.enabled}
          deliveries={query.data.deliveries}
        />
      )}
    </section>
  );
}
