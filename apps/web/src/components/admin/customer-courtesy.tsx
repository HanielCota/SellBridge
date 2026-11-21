import { BILLING_PLANS, type BillingPlanId } from "@sellbridge/shared/billing";
import { brazilIsoDate } from "@sellbridge/shared/period-range";
import { GiftIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { TonePill } from "@/components/data/tone-status";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  adminGrantCustomerCourtesy,
  adminRevokeCustomerCourtesy,
} from "@/features/admin/customer-courtesy.functions";
import {
  courtesyEndText,
  courtesyFormError,
  defaultCourtesyLastDay,
  planOptionLabel,
  type CourtesyForm,
} from "@/features/admin/courtesy-copy";
import { useAdminAction } from "@/features/admin/use-admin-action";

export interface CustomerCourtesyView {
  courtesy: {
    planId: BillingPlanId;
    planName: string;
    expiresAt: string | null;
    reason: string;
  } | null;
  /** The plan the account pays for and would stop renewing; null when it pays nothing. */
  paidPlanName: string | null;
}

interface CourtesyProps {
  userId: string;
  view: CustomerCourtesyView;
  canGrant: boolean;
}

function initialForm(view: CustomerCourtesyView, today: string): CourtesyForm {
  const { courtesy } = view;
  if (courtesy === null) {
    return { plan: "start", hasEnd: true, lastDay: defaultCourtesyLastDay(today), reason: "" };
  }
  const lastDay =
    courtesy.expiresAt === null
      ? defaultCourtesyLastDay(today)
      : brazilIsoDate(new Date(new Date(courtesy.expiresAt).getTime() - 1));
  return { plan: courtesy.planId, hasEnd: courtesy.expiresAt !== null, lastDay, reason: "" };
}

function PlanField({
  value,
  onChange,
}: {
  value: BillingPlanId;
  onChange: (plan: BillingPlanId) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="courtesy-plan">Plano</Label>
      <Select
        value={value}
        onValueChange={(next) => {
          const plan = BILLING_PLANS.find((option) => option.id === next);
          if (plan !== undefined) onChange(plan.id);
        }}
      >
        <SelectTrigger id="courtesy-plan" className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BILLING_PLANS.map((plan) => (
            <SelectItem key={plan.id} value={plan.id}>
              {planOptionLabel(plan)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function EndField({
  form,
  today,
  onChange,
}: {
  form: CourtesyForm;
  today: string;
  onChange: (patch: Partial<CourtesyForm>) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Até quando vale</legend>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="radio"
          name="courtesy-end"
          className="size-4 accent-foreground"
          checked={form.hasEnd}
          onChange={() => onChange({ hasEnd: true })}
        />
        <span className="text-sm">Até o dia</span>
        <Input
          type="date"
          aria-label="Último dia da cortesia"
          className="h-11 w-44"
          min={today}
          value={form.lastDay}
          disabled={!form.hasEnd}
          onChange={(event) => onChange({ lastDay: event.target.value })}
        />
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="radio"
          name="courtesy-end"
          className="size-4 accent-foreground"
          checked={!form.hasEnd}
          onChange={() => onChange({ hasEnd: false })}
        />
        <span className="text-sm">Sem data para acabar</span>
      </label>
    </fieldset>
  );
}

function ReasonField({
  id,
  value,
  error,
  onChange,
}: {
  id: string;
  value: string;
  error: string | null;
  onChange: (reason: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Motivo (fica no registro da equipe)</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={300}
        aria-invalid={error !== null}
        aria-describedby={`${id}-error`}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ex.: conta do cliente dono do projeto"
      />
      <p id={`${id}-error`} aria-live="polite" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </div>
  );
}

function GrantFields({
  form,
  today,
  error,
  paidPlanName,
  onChange,
}: {
  form: CourtesyForm;
  today: string;
  /** What to fix, once the team tried to save. */
  error: ReturnType<typeof courtesyFormError>;
  paidPlanName: string | null;
  onChange: (patch: Partial<CourtesyForm>) => void;
}) {
  return (
    <div className="grid gap-5">
      <PlanField value={form.plan} onChange={(plan) => onChange({ plan })} />
      <EndField form={form} today={today} onChange={onChange} />
      {error?.field === "lastDay" ? (
        <p role="alert" className="-mt-3 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      <ReasonField
        id="courtesy-reason"
        value={form.reason}
        error={error?.field === "reason" ? error.message : null}
        onChange={(reason) => onChange({ reason })}
      />
      {paidPlanName === null ? null : (
        <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Esta conta paga o plano {paidPlanName}. Ao conceder, a assinatura para de renovar e
          nenhuma cobrança nova é feita. O mês já pago não é devolvido.
        </p>
      )}
    </div>
  );
}

function GrantDialog({
  userId,
  view,
  today,
  onClose,
}: {
  userId: string;
  view: CustomerCourtesyView;
  /** The day the dialog was opened (YYYY-MM-DD, Brasília): no date before it is offered. */
  today: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState(() => initialForm(view, today));
  const [showErrors, setShowErrors] = useState(false);
  const changing = view.courtesy !== null;
  const lastDay = form.hasEnd ? form.lastDay : null;
  const grant = useAdminAction(
    () =>
      adminGrantCustomerCourtesy({
        data: { userId, plan: form.plan, lastDay, reason: form.reason.trim() },
      }),
    changing ? "Cortesia atualizada" : "Plano concedido sem cobrança",
    onClose,
  );
  const error = courtesyFormError(form, today);
  const submit = () => {
    setShowErrors(true);
    if (error === null) grant.mutate(undefined);
  };
  const saveLabel = changing ? "Salvar mudança" : "Conceder plano";
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{changing ? "Mudar a cortesia" : "Conceder plano sem cobrança"}</DialogTitle>
          <DialogDescription>
            A conta usa o plano escolhido, com os limites dele, e não paga mensalidade.
          </DialogDescription>
        </DialogHeader>
        <GrantFields
          form={form}
          today={today}
          error={showErrors ? error : null}
          paidPlanName={view.paidPlanName}
          onChange={(patch) => setForm({ ...form, ...patch })}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={grant.isPending} onClick={submit}>
            {grant.isPending ? "Salvando…" : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({
  userId,
  planName,
  onClose,
}: {
  userId: string;
  planName: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const revoke = useAdminAction(
    () => adminRevokeCustomerCourtesy({ data: { userId, reason: reason.trim() } }),
    "Plano sem cobrança retirado",
    onClose,
  );
  const tooShort = reason.trim().length < 5;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Retirar o plano ${planName} desta conta?`}
      description="A conta fica sem plano agora: não conecta loja nova nem publica anúncio novo. Pedidos e anúncios que já estão no ar continuam."
      confirmLabel="Retirar plano"
      pendingLabel="Retirando…"
      isPending={revoke.isPending}
      destructive
      onConfirm={() => {
        setShowErrors(true);
        if (!tooShort) revoke.mutate(undefined);
      }}
    >
      <ReasonField
        id="courtesy-revoke-reason"
        value={reason}
        error={showErrors && tooShort ? "Escreva o motivo, com pelo menos 5 letras." : null}
        onChange={setReason}
      />
    </ConfirmDialog>
  );
}

function CourtesySummary({ courtesy }: { courtesy: CustomerCourtesyView["courtesy"] }) {
  if (courtesy === null) {
    return <p className="text-sm text-muted-foreground">Esta conta não tem plano sem cobrança.</p>;
  }
  return (
    <div className="space-y-1.5">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <GiftIcon weight="bold" className="size-4 text-brand-text" aria-hidden="true" />
        Plano {courtesy.planName}
        <TonePill tone="success" label={courtesyEndText(courtesy.expiresAt)} />
      </p>
      <p className="text-sm text-muted-foreground">Motivo: {courtesy.reason}</p>
    </div>
  );
}

/** The plan the team gave this customer with no charge: give, change or take it back. */
export function CustomerCourtesy({ userId, view, canGrant }: CourtesyProps) {
  const [dialog, setDialog] = useState<
    { kind: "grant"; today: string } | { kind: "revoke" } | null
  >(null);
  const { courtesy } = view;
  return (
    <SectionCard
      title="Plano sem cobrança"
      description="Cortesia da equipe: a conta usa um plano sem pagar mensalidade."
    >
      <div className="space-y-4">
        <CourtesySummary courtesy={courtesy} />
        {canGrant ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant={courtesy === null ? "default" : "outline"}
              className="h-11"
              onClick={() => setDialog({ kind: "grant", today: brazilIsoDate(new Date()) })}
            >
              {courtesy === null ? "Conceder plano sem cobrança" : "Mudar plano ou data"}
            </Button>
            {courtesy === null ? null : (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setDialog({ kind: "revoke" })}
              >
                Retirar plano
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Só um administrador concede ou retira o plano sem cobrança.
          </p>
        )}
      </div>
      {dialog?.kind === "grant" ? (
        <GrantDialog
          userId={userId}
          view={view}
          today={dialog.today}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "revoke" && courtesy !== null ? (
        <RevokeDialog
          userId={userId}
          planName={courtesy.planName}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </SectionCard>
  );
}
