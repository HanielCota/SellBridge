import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { billingQueryOptions } from "@/features/billing/billing.queries";
import { checkoutBilling, manageBilling } from "@/features/billing/billing.functions";

const STATUS_LABELS: Record<string, string> = {
  free: "Gratuito",
  active: "Ativa",
  trialing: "Período de teste",
  past_due: "Pagamento pendente",
  unpaid: "Pagamento não realizado",
  incomplete: "Pagamento incompleto",
  incomplete_expired: "Pagamento expirado",
  canceled: "Cancelada",
  paused: "Pausada",
};
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);

function useBillingAction() {
  return useMutation({
    mutationFn: async (plan: "pro" | "business" | "portal") => {
      const result =
        plan === "portal" ? await manageBilling() : await checkoutBilling({ data: { plan } });
      window.location.assign(result.url);
    },
    onError: (error) => toast.error(error.message || "Não foi possível abrir o pagamento"),
  });
}

function CurrentSubscription() {
  const { data } = useSuspenseQuery(billingQueryOptions());
  const action = useBillingAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Seu plano: {data.effectivePlan.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p>Status: {STATUS_LABELS[data.account?.status ?? "free"] ?? "Em atualização"}</p>
        <p>
          {data.usage.stores} de {data.effectivePlan.stores} lojas · {data.usage.listings} de{" "}
          {data.effectivePlan.listings} anúncios
        </p>
        {data.account?.periodEnd ? (
          <p>
            {data.account.status === "canceled"
              ? "Encerrada em"
              : data.account.cancelAtPeriodEnd
                ? "Cancelamento previsto para"
                : "Fim do período atual"}
            :{" "}
            {new Date(data.account.periodEnd).toLocaleDateString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
          </p>
        ) : null}
        {data.account?.status === "past_due" || data.account?.status === "unpaid" ? (
          <p role="alert">Atualize seu pagamento para recuperar os limites do plano contratado.</p>
        ) : null}
        {data.account?.customerId ? (
          <Button
            disabled={!data.canManage || !data.enabled || action.isPending}
            onClick={() => action.mutate("portal")}
          >
            Gerenciar assinatura e faturas
          </Button>
        ) : null}
        <p className="text-sm text-muted-foreground">
          No portal você pode trocar de plano, atualizar o cartão, consultar faturas e cancelar a
          renovação.
        </p>
      </CardContent>
    </Card>
  );
}

function PlanChoices() {
  const { data } = useSuspenseQuery(billingQueryOptions());
  const action = useBillingAction();
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {data.plans.map((plan) => {
        const price = data.prices.find((candidate) => candidate.id === plan.id);
        return (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-2xl font-semibold">
                {plan.id === "free"
                  ? "R$ 0"
                  : price
                    ? `${money(price.priceCents)}/mês`
                    : "Em breve"}
              </p>
              <ul className="space-y-2">
                <li>Até {plan.stores} lojas conectadas</li>
                <li>Até {plan.listings} anúncios</li>
                <li>Catálogo, dashboard, finanças e suporte</li>
              </ul>
              {plan.id === "free" ? (
                <p className="text-sm text-muted-foreground">
                  {data.effectivePlan.id === "free"
                    ? "Plano atual"
                    : "Disponível após o encerramento da assinatura"}
                </p>
              ) : (
                <Button
                  className="w-full"
                  disabled={
                    !data.enabled ||
                    !data.canManage ||
                    action.isPending ||
                    data.effectivePlan.id === plan.id
                  }
                  onClick={() => action.mutate(plan.id === "pro" ? "pro" : "business")}
                >
                  {data.effectivePlan.id === plan.id ? "Plano atual" : "Selecionar plano"}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function BillingPage({ returned }: { returned?: string | undefined }) {
  const { data } = useSuspenseQuery(billingQueryOptions());
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-semibold">Planos e assinatura</h1>
        <p className="mt-2 text-muted-foreground">
          Escolha o plano para suas lojas. Os planos pagos renovam automaticamente a cada mês.
        </p>
      </div>
      {returned === "sucesso" ? (
        <output className="block">
          Pagamento enviado. A confirmação e os limites serão atualizados automaticamente.
        </output>
      ) : null}
      {returned === "cancelado" ? (
        <output className="block">Você saiu do pagamento. Seu plano permanece o mesmo.</output>
      ) : null}
      {data.enabled ? null : (
        <output className="block">
          Os planos pagos estarão disponíveis quando a cobrança for ativada. Sua operação atual
          continua disponível.
        </output>
      )}
      {data.canManage ? null : (
        <p>Somente o proprietário da organização pode alterar a assinatura.</p>
      )}
      <CurrentSubscription />
      <PlanChoices />
      <p className="text-sm text-muted-foreground">
        Ao encerrar um plano, os dados são preservados. Novos anúncios e conexões ficam sujeitos aos
        limites do plano disponível.
      </p>
    </main>
  );
}
