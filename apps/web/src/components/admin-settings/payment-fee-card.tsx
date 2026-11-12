import { formatCents } from "@sellbridge/shared/money";
import { platformFeeCents } from "@sellbridge/shared/shipment-payments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { PaymentPill } from "@/components/supplier-payments/supplier-payment-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFeePercent, readFeePercent } from "@/features/supplier-payments/fee-percent";
import { savePaymentFeeFn } from "@/features/supplier-payments/supplier-payments.functions";
import { paymentFeeQueryOptions } from "@/features/supplier-payments/supplier-payments.queries";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";

/** The example order the card works out the fee on: R$ 100,00. */
const EXAMPLE_ORDER_CENTS = 10_000;

function feeField(basisPoints: number): string {
  return formatFeePercent(basisPoints).replace("%", "");
}

function FeeStatus({
  basisPoints,
  isDefault,
  updatedAt,
}: {
  basisPoints: number;
  isDefault: boolean;
  updatedAt: string | null;
}) {
  if (isDefault || updatedAt === null) {
    return <PaymentPill tone="success">{`${formatFeePercent(basisPoints)} · padrão`}</PaymentPill>;
  }
  return (
    <PaymentPill tone="success">
      {`${formatFeePercent(basisPoints)} · desde ${formatAbsoluteTime(new Date(updatedAt))}`}
    </PaymentPill>
  );
}

/** The rate field with its unit, its limits and, after leaving it, how to fix a wrong value. */
function FeeInput({
  typed,
  error,
  onChange,
  onBlur,
}: {
  typed: string;
  error: string | null;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const fieldId = useId();
  return (
    <div className="grid max-w-56 gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium">
        Taxa (%)
      </label>
      <div className="relative">
        <Input
          id={fieldId}
          inputMode="decimal"
          autoComplete="off"
          placeholder="Ex.: 1"
          value={typed}
          aria-invalid={error === null ? undefined : true}
          aria-describedby={`${fieldId}-hint`}
          className="h-11 pr-9"
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-muted-foreground"
        >
          %
        </span>
      </div>
      <span id={`${fieldId}-hint`} className="text-sm text-muted-foreground">
        De 0 a 30. Aceita uma casa: 4,5.
      </span>
      {error === null ? null : (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

function FeeForm({ saved }: { saved: number }) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState(feeField(saved));
  const [touched, setTouched] = useState(false);
  const reading = readFeePercent(typed);
  const save = useMutation({
    mutationFn: (basisPoints: number) => savePaymentFeeFn({ data: { basisPoints } }),
    onSuccess: async (result) => {
      toast.success(
        `Taxa salva: ${formatFeePercent(result.basisPoints ?? 0)} nos próximos pagamentos.`,
      );
      await queryClient.invalidateQueries({ queryKey: paymentFeeQueryOptions().queryKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const error = touched && !reading.ok ? reading.message : null;
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (reading.ok) save.mutate(reading.basisPoints);
      }}
    >
      <FeeInput typed={typed} error={error} onChange={setTyped} onBlur={() => setTouched(true)} />
      {reading.ok ? (
        <p className="text-sm">
          Num pedido de {formatCents(EXAMPLE_ORDER_CENTS)}, o SellBridge fica com{" "}
          <strong>{formatCents(platformFeeCents(EXAMPLE_ORDER_CENTS, reading.basisPoints))}</strong>
          . O fornecedor recebe o resto, menos a tarifa do Mercado Pago.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="submit" size="lg" disabled={save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar taxa"}
        </Button>
        <span className="text-sm text-muted-foreground">
          Vale para os próximos pagamentos. Os já feitos não mudam.
        </span>
      </div>
    </form>
  );
}

/** SellBridge's share of every supplier payment made through Mercado Pago, set by an admin. */
export function PaymentFeeCard() {
  const query = useQuery(paymentFeeQueryOptions());
  return (
    <section
      aria-labelledby="payment-fee-title"
      className="surface-card grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="payment-fee-title" className="text-subhead font-medium">
          Taxa do SellBridge nos pagamentos
        </h2>
        {query.data === undefined ? null : (
          <FeeStatus
            basisPoints={query.data.basisPoints}
            isDefault={query.data.isDefault}
            updatedAt={query.data.updatedAt}
          />
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Quando o revendedor paga um pedido pelo Mercado Pago, o SellBridge fica com esta porcentagem
        e o resto vai para o fornecedor.
      </p>
      {query.isPending ? <Skeleton className="h-32 rounded-2xl" /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data === undefined ? null : <FeeForm saved={query.data.basisPoints} />}
    </section>
  );
}
