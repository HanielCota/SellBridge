import { billingPlan, type BillingPlan } from "@sellbridge/shared/billing";
import { formatCents } from "@sellbridge/shared/money";
import { CreditCardIcon, PixLogoIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changeBillingPlan, quoteBillingPlan } from "@/features/billing/billing.functions";
import { errorMessage } from "@/lib/errors";
import { dateLabel, planById, useBillingAction, type BillingData } from "./billing-data";

export type PaymentMethod = "pix" | "credit_card";

function MethodOption({
  icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 sm:p-5"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand-text">
        {icon}
      </span>
      <span className="space-y-1">
        <span className="block text-base font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

/** Card or Pix: both open the Asaas page; the choice is the only thing asked here. */
export function PaymentMethodDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  pending: boolean;
  onChoose: (method: PaymentMethod) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg sm:p-7">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <MethodOption
            icon={<CreditCardIcon weight="fill" className="size-7" aria-hidden="true" />}
            title="Cartão de crédito"
            description="Renova sozinho todo mês. Você digita o cartão uma vez, na página segura do Asaas."
            disabled={pending}
            onClick={() => onChoose("credit_card")}
          />
          <MethodOption
            icon={<PixLogoIcon weight="fill" className="size-7" aria-hidden="true" />}
            title="Pix"
            description="Todo mês chega um Pix novo no seu e-mail para você pagar."
            disabled={pending}
            onClick={() => onChoose("pix")}
          />
        </div>
        {pending ? (
          <output className="block text-sm text-muted-foreground">Abrindo o pagamento...</output>
        ) : null}
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PlanChangeQuote = Awaited<ReturnType<typeof quoteBillingPlan>>;

interface ChangeCopy {
  description: string;
  confirmLabel: string;
}

function changeCopy(quote: PlanChangeQuote, target: BillingPlan, current: BillingPlan): ChangeCopy {
  const monthly = formatCents(target.priceCents);
  if (quote.kind === "upgrade_pay") {
    const difference = formatCents(quote.differenceCents);
    return {
      description: `Você paga agora ${difference}, a diferença até ${dateLabel(quote.until)}. Depois, a mensalidade passa a ${monthly}.`,
      confirmLabel: `Pagar ${difference}`,
    };
  }
  if (quote.kind === "upgrade_now") {
    return {
      description: `O ${target.name} começa agora, sem custo extra até a próxima mensalidade. Depois, a mensalidade passa a ${monthly}.`,
      confirmLabel: "Mudar agora",
    };
  }
  if (quote.kind === "schedule") {
    return {
      description: `O ${target.name} começa em ${dateLabel(quote.startsAt)}, na próxima mensalidade, que sai por ${monthly}. Até lá, você continua no ${current.name}.`,
      confirmLabel: "Agendar a troca",
    };
  }
  return {
    description: `A troca de plano agendada é cancelada. Você continua no ${target.name} por ${monthly} por mês.`,
    confirmLabel: `Continuar no ${target.name}`,
  };
}

/** Shows what the change costs or when it starts before anything changes. */
export function PlanChangeDialog({
  data,
  target,
  open,
  onOpenChange,
}: {
  data: BillingData;
  target: BillingPlan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const quote = useQuery({
    queryKey: ["billing", "quote", target.id],
    queryFn: async () => quoteBillingPlan({ data: { plan: target.id } }),
    enabled: open,
    staleTime: 0,
  });
  const change = useBillingAction(
    async () => changeBillingPlan({ data: { plan: target.id } }),
    "Plano atualizado.",
  );
  const current =
    planById(data.access.kind === "plan" ? data.access.planId : null) ?? billingPlan(target.id);
  const copy = quote.data === undefined ? null : changeCopy(quote.data, target, current);
  const waiting = quote.isError ? errorMessage(quote.error) : "Calculando o valor...";
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Mudar para o ${target.name}`}
      description={copy?.description ?? waiting}
      confirmLabel={copy?.confirmLabel ?? "Confirmar"}
      pendingLabel={change.isPending ? "Enviando..." : "Aguarde..."}
      isPending={change.isPending || copy === null}
      onConfirm={() => change.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
    />
  );
}
