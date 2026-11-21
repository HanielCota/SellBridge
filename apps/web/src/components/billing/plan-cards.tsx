import type { BillingPlan, BillingPlanId } from "@sellbridge/shared/billing";
import { formatCents } from "@sellbridge/shared/money";
import { CheckIcon, HeadsetIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DisabledHint } from "@/components/ui/hint";
import { subscribeBilling } from "@/features/billing/billing.functions";
import {
  overLimitWarning,
  planAllowance,
  priceParts,
  recommendedPlan,
} from "@/features/billing/plan-choice";
import {
  currentPlanOf,
  hasLiveSubscription,
  priceOf,
  useBillingAction,
  type BillingData,
} from "./billing-data";
import { planCardState } from "./plan-card-state";
import { PaymentMethodDialog, PlanChangeDialog, type PaymentMethod } from "./billing-dialogs";

function PlanPrice({ priceCents }: { priceCents: number | undefined }) {
  if (priceCents === undefined) {
    return (
      <p className="flex h-10 items-end text-lg font-medium text-muted-foreground">Em breve</p>
    );
  }
  const { reais, cents } = priceParts(priceCents);
  return (
    <p className="h-10">
      <span className="sr-only">{formatCents(priceCents)} por mês</span>
      <span aria-hidden="true" className="flex items-baseline gap-0.5 whitespace-nowrap">
        <span className="self-start pt-1 text-sm font-medium text-muted-foreground">R$</span>
        <span className="text-4xl font-semibold tracking-tight">{reais}</span>
        {cents === null ? null : <span className="text-lg font-semibold">{cents}</span>}
        <span className="ml-1 text-sm text-muted-foreground">/mês</span>
      </span>
    </p>
  );
}

function PlanFeatures({ plan }: { plan: BillingPlan }) {
  const allowance = planAllowance(plan);
  return (
    <ul className="space-y-2.5 border-t border-border pt-4 text-muted-foreground">
      {[allowance.stores, allowance.listings].map((item) => (
        <li key={item.label} className="flex gap-2">
          <CheckIcon
            weight="bold"
            className="mt-0.5 size-4 shrink-0 text-brand-text"
            aria-hidden="true"
          />
          <span>
            <span className="font-semibold text-foreground">{item.amount}</span> {item.label}
          </span>
        </li>
      ))}
      {plan.prioritySupport ? (
        <li className="flex gap-2 text-foreground">
          <HeadsetIcon
            weight="bold"
            className="mt-0.5 size-4 shrink-0 text-brand-text"
            aria-hidden="true"
          />
          <span>
            <span className="font-semibold">Atendimento prioritário:</span> resposta em até 8 horas
          </span>
        </li>
      ) : null}
    </ul>
  );
}

function StatusTile({ children }: { children: string }) {
  return (
    <p className="flex h-11 items-center justify-center gap-2 rounded-xl bg-muted text-sm font-medium">
      <CheckIcon weight="bold" className="size-4 text-brand-text" aria-hidden="true" />
      {children}
    </p>
  );
}

function planCardRing(recommended: boolean, isCurrent: boolean): string | undefined {
  if (recommended) return "ring-2 ring-brand";
  if (isCurrent) return "ring-2 ring-brand-text/40";
  return undefined;
}

function PlanAction({
  plan,
  data,
  isCurrent,
  recommended,
  onChoose,
}: {
  plan: BillingPlan;
  data: BillingData;
  isCurrent: boolean;
  recommended: boolean;
  onChoose: (plan: BillingPlan) => void;
}) {
  const state = planCardState(plan, data, isCurrent);
  if (state.kind === "off") {
    return <p className="text-sm text-muted-foreground">Disponível quando a cobrança começar</p>;
  }
  if (state.kind === "in_use") return <StatusTile>Plano em uso</StatusTile>;
  // Said once, next to the plan in use: four cards repeating it would bury the plans.
  if (state.kind === "courtesy") return null;
  if (state.kind === "starts") return <StatusTile>{`Começa em ${state.on}`}</StatusTile>;
  const button = (
    <Button
      className="h-11 w-full"
      variant={recommended ? "default" : "outline"}
      disabled={state.reason !== null}
      onClick={() => onChoose(plan)}
    >
      {state.label}
    </Button>
  );
  if (state.reason === null) return button;
  return <DisabledHint reason={state.reason}>{button}</DisabledHint>;
}

function PlanCard({
  plan,
  data,
  recommended,
  onChoose,
}: {
  plan: BillingPlan;
  data: BillingData;
  recommended: boolean;
  onChoose: (plan: BillingPlan) => void;
}) {
  const current = currentPlanOf(data);
  const isCurrent = current?.id === plan.id;
  const warning = current === null || isCurrent ? null : overLimitWarning(plan, data.usage);
  return (
    <Card className={planCardRing(recommended, isCurrent)}>
      <CardHeader className="gap-2">
        {/* Side by side, every card keeps the badge row so the prices line up; stacked, it can go. */}
        <div className="flex flex-wrap items-center gap-2 empty:hidden sm:min-h-6 sm:empty:flex">
          {isCurrent ? <Badge>Seu plano</Badge> : null}
          {recommended ? <Badge>Indicado para você</Badge> : null}
        </div>
        <h3 className="text-xl font-semibold tracking-tight">{plan.name}</h3>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <PlanPrice priceCents={data.enabled ? priceOf(data, plan.id) : undefined} />
        <PlanFeatures plan={plan} />
        {warning === null ? null : <p className="text-sm text-muted-foreground">{warning}</p>}
        <div className="mt-auto">
          <PlanAction
            plan={plan}
            data={data}
            isCurrent={isCurrent}
            recommended={recommended}
            onChoose={onChoose}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SubscribeDialog({ plan, onClose }: { plan: BillingPlan; onClose: () => void }) {
  const subscribe = useBillingAction(
    async (method: PaymentMethod) => subscribeBilling({ data: { plan: plan.id, method } }),
    "Assinatura criada.",
  );
  return (
    <PaymentMethodDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Como você quer pagar o ${plan.name}?`}
      description={`${formatCents(plan.priceCents)} por mês. O pagamento é feito na página segura do Asaas.`}
      pending={subscribe.isPending}
      onChoose={(method) => subscribe.mutate(method)}
    />
  );
}

export function PlanChoices({ data }: { data: BillingData }) {
  const [chosen, setChosen] = useState<BillingPlanId | null>(null);
  // Only an account still choosing gets a plan pointed out; one with a plan already chose.
  const recommended =
    data.enabled && currentPlanOf(data) === null ? recommendedPlan(data.usage).id : null;
  const chosenPlan = data.plans.find((plan) => plan.id === chosen) ?? null;
  const live = hasLiveSubscription(data);
  return (
    <section aria-labelledby="plan-choices-title" className="space-y-3">
      <h2 id="plan-choices-title" className="text-lg font-semibold">
        Planos
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {data.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            data={data}
            recommended={recommended === plan.id}
            onChoose={(picked) => setChosen(picked.id)}
          />
        ))}
      </div>
      {chosenPlan === null || live ? null : (
        <SubscribeDialog plan={chosenPlan} onClose={() => setChosen(null)} />
      )}
      {chosenPlan === null || !live ? null : (
        <PlanChangeDialog
          data={data}
          target={chosenPlan}
          open
          onOpenChange={(open) => {
            if (!open) setChosen(null);
          }}
        />
      )}
    </section>
  );
}
