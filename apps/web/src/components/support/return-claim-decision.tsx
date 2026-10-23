import type { ReturnClaimView } from "@sellbridge/database/repositories";
import { formatCents, parseBrlToCents } from "@sellbridge/shared/money";
import {
  REFUSAL_REASON_MAX,
  REFUSAL_REASON_MIN,
  type ReturnClaimDecision,
} from "@sellbridge/shared/return-claims";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { SmartDate } from "@/components/data/smart-date";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { staffDecideReturnClaim } from "@/features/support/return-claims.functions";
import { formatCentsForField, maskCurrencyInput, readPastedCurrency } from "@/lib/currency-mask";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { ClaimItems, ClaimStatusLine, claimOutcomeText } from "./return-claim-parts";

function useDecideClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: ReturnClaimDecision) => staffDecideReturnClaim({ data: decision }),
    onSuccess: async (result) => {
      toast.success(result.status === "credited" ? "Crédito registrado" : "Devolução sem crédito");
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** Why the typed amount cannot be credited, or null when it can. */
function amountProblem(amountCents: number | null, maximumCents: number): string | null {
  if (amountCents === null || amountCents <= 0) {
    return "Informe o valor do crédito";
  }
  if (amountCents > maximumCents) {
    return `O crédito vai até ${formatCents(maximumCents)}, o custo pago ao fornecedor`;
  }
  return null;
}

function CreditAmountField({
  maximumCents,
  typed,
  problem,
  onType,
  disabled,
}: {
  maximumCents: number;
  typed: string;
  problem: string | null;
  onType: (value: string) => void;
  disabled: boolean;
}) {
  const fieldId = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="text-xs text-muted-foreground">
        Valor do crédito ao revendedor
      </label>
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-xl border border-field-border bg-field px-3.5 sm:max-w-xs focus-within:border-brand-strong focus-within:ring-4 focus-within:ring-brand/20",
          problem !== null &&
            "border-destructive focus-within:border-destructive focus-within:ring-destructive/15",
        )}
      >
        <span className="text-body text-muted-foreground sm:text-subhead">R$</span>
        <input
          id={fieldId}
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          disabled={disabled}
          aria-invalid={problem !== null}
          aria-describedby={`${fieldId}-hint`}
          value={typed}
          onPaste={(event) => {
            event.preventDefault();
            const pasted = readPastedCurrency(event.clipboardData.getData("text"));
            if (pasted !== null) onType(pasted);
          }}
          onChange={(event) => {
            const field = event.currentTarget;
            onType(maskCurrencyInput(field.value));
            // The mask rewrites the whole value; keep typing at the end, like a card machine.
            requestAnimationFrame(() =>
              field.setSelectionRange(field.value.length, field.value.length),
            );
          }}
          // 16px or more on phones, or iOS zooms the page in when the field takes focus.
          className="min-w-0 flex-1 bg-transparent text-body tabular-nums outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-subhead"
        />
      </div>
      <p
        id={`${fieldId}-hint`}
        className={cn("text-xs", problem === null ? "text-muted-foreground" : "text-destructive")}
      >
        {problem ?? `Até ${formatCents(maximumCents)}, o custo pago ao fornecedor.`}
      </p>
    </div>
  );
}

function CreditForm({ claim, onRefuse }: { claim: ReturnClaimView; onRefuse: () => void }) {
  const decide = useDecideClaim();
  const [typed, setTyped] = useState(formatCentsForField(claim.supplierCostCents));
  const amountCents = parseBrlToCents(typed);
  const problem = amountProblem(amountCents, claim.supplierCostCents);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem !== null || amountCents === null) {
          return;
        }
        decide.mutate({ claimId: claim.id, decision: "credit", amountCents });
      }}
    >
      <CreditAmountField
        maximumCents={claim.supplierCostCents}
        typed={typed}
        problem={problem}
        onType={setTyped}
        disabled={decide.isPending}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={problem !== null || decide.isPending}>
          Creditar ao revendedor
        </Button>
        <Button type="button" variant="outline" onClick={onRefuse} disabled={decide.isPending}>
          Não creditar
        </Button>
      </div>
    </form>
  );
}

function RefuseForm({ claim, onBack }: { claim: ReturnClaimView; onBack: () => void }) {
  const fieldId = useId();
  const decide = useDecideClaim();
  const [reason, setReason] = useState("");
  const ready = reason.trim().length >= REFUSAL_REASON_MIN;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        decide.mutate({ claimId: claim.id, decision: "refuse", reason });
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor={fieldId} className="text-xs text-muted-foreground">
          Por que não haverá crédito? O revendedor lê este motivo.
        </label>
        <Textarea
          id={fieldId}
          value={reason}
          maxLength={REFUSAL_REASON_MAX}
          placeholder="Ex.: as fotos mostram que o produto voltou usado pelo comprador."
          onChange={(event) => setReason(event.currentTarget.value)}
          className="min-h-20"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={!ready || decide.isPending}>
          Confirmar sem crédito
        </Button>
        <Button type="button" variant="ghost" onClick={onBack} disabled={decide.isPending}>
          Voltar
        </Button>
      </div>
    </form>
  );
}

function PendingDecision({ claim, canDecide }: { claim: ReturnClaimView; canDecide: boolean }) {
  const [refusing, setRefusing] = useState(false);
  if (!canDecide) {
    return (
      <p className="text-xs text-muted-foreground">
        Supervisores e administradores decidem o crédito.
      </p>
    );
  }
  if (refusing) {
    return <RefuseForm claim={claim} onBack={() => setRefusing(false)} />;
  }
  return <CreditForm claim={claim} onRefuse={() => setRefusing(true)} />;
}

function DecidedBy({ claim }: { claim: ReturnClaimView }) {
  if (claim.decidedAt === null) {
    return null;
  }
  return (
    <p className="text-xs text-muted-foreground">
      Decidido por {claim.decidedByName ?? "alguém que saiu da equipe"}{" "}
      <SmartDate date={claim.decidedAt} />. Crédito registrado no saldo, sem pagamento automático.
    </p>
  );
}

/**
 * For the team, above the thread of a return's ticket: what came back, from which reseller, and
 * the decision. Crediting defaults to the supplier cost and can only go down from it.
 */
export function ReturnClaimDecision({
  claim,
  viewerRole,
}: {
  claim: ReturnClaimView | null;
  viewerRole: string | null | undefined;
}) {
  if (claim === null) {
    return null;
  }
  const canDecide = hasStaffPermission(viewerRole, "support.credit_returns");
  return (
    <section
      aria-labelledby="return-claim-title"
      className="surface-card space-y-3 rounded-3xl bg-card p-5"
    >
      <h2 id="return-claim-title" className="text-xs text-muted-foreground">
        Devolução · crédito do fornecedor
      </h2>
      <p className="text-sm text-muted-foreground">
        Pedido <span className="font-medium text-foreground">{claim.externalOrderId}</span> de{" "}
        {claim.sellerName}, fornecedor {claim.supplierName}. Custo pago ao fornecedor:{" "}
        <span className="tabular-nums">{formatCents(claim.supplierCostCents)}</span>.
      </p>
      <ClaimItems items={claim.items} />
      <ClaimStatusLine status={claim.status}>{claimOutcomeText(claim)}</ClaimStatusLine>
      {claim.status === "in_review" ? (
        <PendingDecision claim={claim} canDecide={canDecide} />
      ) : (
        <DecidedBy claim={claim} />
      )}
    </section>
  );
}
