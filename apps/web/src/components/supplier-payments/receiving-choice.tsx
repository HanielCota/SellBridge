import type { PaymentProviderName } from "@sellbridge/shared/payment-accounts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { chooseReceivingProviderFn } from "@/features/supplier-payments/asaas.functions";
import { asaasReceivingQueryOptions } from "@/features/supplier-payments/asaas.queries";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { AsaasReceivingView } from "./asaas-receiving-card";

const OPTIONS: readonly { provider: PaymentProviderName; title: string; detail: string }[] = [
  {
    provider: "mercado_pago",
    title: "Mercado Pago",
    detail: "O dinheiro cai na hora em que o revendedor paga.",
  },
  {
    provider: "asaas",
    title: "Asaas, com proteção",
    detail: "O dinheiro fica guardado e é liberado 7 dias depois da entrega.",
  },
];

const PROVIDER_NAMES: Readonly<Record<PaymentProviderName, string>> = {
  mercado_pago: "Mercado Pago",
  asaas: "Asaas",
};

function usableOf(view: AsaasReceivingView, provider: PaymentProviderName): boolean {
  if (provider === "asaas") {
    return view.asaasUsable;
  }
  return view.mercadoPagoUsable && !view.protectionRequired;
}

function useChoose(supplierId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: PaymentProviderName) =>
      chooseReceivingProviderFn({ data: { supplierId, provider } }),
    onSuccess: async ({ provider }) => {
      toast.success(`Pronto. Os próximos pagamentos vão para o ${PROVIDER_NAMES[provider]}.`);
      await queryClient.invalidateQueries({
        queryKey: asaasReceivingQueryOptions(supplierId).queryKey,
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/**
 * Where the next payments go, once both accounts can receive. A switch only changes new
 * payments: what was already paid or opened stays where it started.
 */
export function ReceivingChoice({
  supplierId,
  view,
}: {
  supplierId: string;
  view: AsaasReceivingView;
}) {
  const choose = useChoose(supplierId);
  if (!view.mercadoPagoUsable || !view.asaasUsable) {
    return null;
  }
  const current = choose.isPending ? choose.variables : view.receivingProvider;
  return (
    <section aria-labelledby="receiving-choice-title" className="grid max-w-3xl gap-3">
      <div className="grid gap-1">
        <h2 id="receiving-choice-title" className="text-subhead font-medium">
          Para onde vão os próximos pagamentos
        </h2>
        <p className="text-sm text-muted-foreground">
          Você pode trocar quando quiser. O que já foi pago continua onde está.
        </p>
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Para onde vão os próximos pagamentos</legend>
        {OPTIONS.map((option) => (
          <label
            key={option.provider}
            className={cn(
              "grid min-h-11 cursor-pointer gap-0.5 rounded-2xl border p-4 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              current === option.provider ? "border-foreground bg-muted" : "border-border",
            )}
          >
            <input
              type="radio"
              name="receiving-provider"
              className="sr-only"
              checked={current === option.provider}
              disabled={!usableOf(view, option.provider) || choose.isPending}
              onChange={() => choose.mutate(option.provider)}
            />
            <span className="font-medium">
              {current === option.provider ? "✓ " : ""}
              {option.title}
            </span>
            <span className="text-sm text-muted-foreground">{option.detail}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
