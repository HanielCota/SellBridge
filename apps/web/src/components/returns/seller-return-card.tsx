import type { OrderReturnView } from "@sellbridge/database/repositories";
import { TRACKING_CODE_MAX, TRACKING_CODE_MIN } from "@sellbridge/shared/return-policy";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmReturnReceivedFn,
  forwardReturnFn,
  markReturnArrivedHereFn,
} from "@/features/returns/returns.functions";
import { errorMessage } from "@/lib/errors";
import { deadlineText } from "./return-labels";
import { ClosedOutcome, ReturnStepPill, StatedReason, SupplierFinding } from "./return-parts";
import { ReasonForm } from "./reason-form";

function useReturnAction<TInput>(
  orderId: string,
  action: (input: { data: TInput }) => Promise<unknown>,
  done: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => action({ data: input }),
    onSuccess: async () => {
      toast.success(done);
      await queryClient.invalidateQueries({ queryKey: ["order-returns", orderId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** Case B: the parcel came back to the reseller's own address instead of the supplier's. */
function ArrivedHere({ claim, orderId }: { claim: OrderReturnView; orderId: string }) {
  const arrived = useReturnAction(
    orderId,
    markReturnArrivedHereFn,
    "Anotado: o pacote está com você",
  );
  return (
    <div className="grid gap-1.5 border-t border-border pt-4">
      <p className="text-sm font-medium">
        O pacote voltou para o seu endereço, e não para o fornecedor?
      </p>
      <p className="text-sm text-muted-foreground">
        Avise aqui. Você terá 7 dias para reenviar o pacote ao fornecedor; sem o reenvio, ele não
        deve nada nesta devolução.
      </p>
      <div>
        <Button
          variant="outline"
          className="h-11"
          disabled={arrived.isPending}
          onClick={() => arrived.mutate({ claimId: claim.claimId })}
        >
          {arrived.isPending ? "Salvando…" : "O pacote voltou para mim"}
        </Button>
      </div>
    </div>
  );
}

function ForwardForm({ claim, orderId }: { claim: OrderReturnView; orderId: string }) {
  const fieldId = useId();
  const [code, setCode] = useState("");
  const forward = useReturnAction(orderId, forwardReturnFn, "Reenvio registrado");
  const trimmed = code.trim();
  const tooShort = trimmed.length < TRACKING_CODE_MIN;
  const due = claim.policy.forwardDueAt;
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (tooShort) {
          return;
        }
        forward.mutate({ claimId: claim.claimId, trackingCode: trimmed });
      }}
    >
      <h4 className="text-sm font-semibold">
        Reenvie o pacote ao fornecedor {due === null ? "" : deadlineText(due)}
      </h4>
      <label htmlFor={fieldId} className="text-sm">
        Código de rastreio do reenvio
      </label>
      <Input
        id={fieldId}
        value={code}
        maxLength={TRACKING_CODE_MAX}
        autoComplete="off"
        placeholder="Ex.: BR123456789BR"
        aria-describedby={`${fieldId}-hint`}
        className="h-11 sm:max-w-xs"
        onChange={(event) => setCode(event.currentTarget.value)}
      />
      <p id={`${fieldId}-hint`} className="text-footnote text-muted-foreground">
        O fornecedor vê esse código para acompanhar o pacote.
      </p>
      <div>
        <Button type="submit" size="lg" disabled={tooShort || forward.isPending}>
          {forward.isPending ? "Salvando…" : "Registrar reenvio"}
        </Button>
      </div>
    </form>
  );
}

function DeliveredToSupplier({ claim, orderId }: { claim: OrderReturnView; orderId: string }) {
  const received = useReturnAction(
    orderId,
    confirmReturnReceivedFn,
    "Anotado: o fornecedor recebeu o pacote",
  );
  return (
    <div className="grid gap-1.5">
      <p className="text-sm">
        Reenviado com o código{" "}
        <span className="font-medium">{claim.policy.forwardTrackingCode ?? ""}</span>. Quando o
        rastreio mostrar a entrega, avise aqui: o prazo do fornecedor começa nessa hora.
      </p>
      <div>
        <Button
          variant="outline"
          className="h-11"
          disabled={received.isPending}
          onClick={() => received.mutate({ claimId: claim.claimId })}
        >
          {received.isPending ? "Salvando…" : "Entregue ao fornecedor"}
        </Button>
      </div>
    </div>
  );
}

/** The reason already sent, with a way to correct it until the supplier answers. */
function ReasonSection({
  claim,
  orderId,
  primary,
}: {
  claim: OrderReturnView;
  orderId: string;
  primary: boolean;
}) {
  const [correcting, setCorrecting] = useState(false);
  if (claim.policy.reason === null) {
    return (
      <>
        <p className="text-sm">
          Conte ao fornecedor por que o comprador devolveu. Sem o motivo, a devolução é tratada como
          desistência do comprador.
        </p>
        <ReasonForm claim={claim} orderId={orderId} primary={primary} />
      </>
    );
  }
  if (correcting) {
    return <ReasonForm claim={claim} orderId={orderId} primary={primary} />;
  }
  return (
    <>
      <StatedReason policy={claim.policy} title="O que você contou" />
      <div>
        <Button variant="outline" className="h-11" onClick={() => setCorrecting(true)}>
          Corrigir o motivo
        </Button>
      </div>
    </>
  );
}

function canTellReason(claim: OrderReturnView): boolean {
  return claim.policy.supplierAnsweredAt === null && claim.policy.step !== "closed";
}

/** What the reseller can do now, by step; one main button at a time. */
function NextStep({ claim, orderId }: { claim: OrderReturnView; orderId: string }) {
  const { policy } = claim;
  if (policy.step === "awaiting_forward") {
    return (
      <>
        <ForwardForm claim={claim} orderId={orderId} />
        <ReasonSection claim={claim} orderId={orderId} primary={false} />
      </>
    );
  }
  if (policy.step === "forwarded") {
    return (
      <>
        <DeliveredToSupplier claim={claim} orderId={orderId} />
        <ReasonSection claim={claim} orderId={orderId} primary={false} />
      </>
    );
  }
  if (!canTellReason(claim)) {
    return null;
  }
  return (
    <>
      <ReasonSection claim={claim} orderId={orderId} primary />
      {policy.destination === "supplier" ? <ArrivedHere claim={claim} orderId={orderId} /> : null}
    </>
  );
}

/** One supplier's return on the reseller's order page: where it stands and what to do now. */
export function SellerReturnCard({ claim, orderId }: { claim: OrderReturnView; orderId: string }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="surface-card grid gap-4 rounded-3xl bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-subhead font-medium">
          Devolução · {claim.supplierName}
        </h3>
        <ReturnStepPill policy={claim.policy} />
      </div>
      <ul className="grid gap-1 text-sm">
        {claim.items.map((item) => (
          <li key={item.title} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground tabular-nums">{item.quantity} ×</span>
            <span className="min-w-0 break-words">{item.title}</span>
          </li>
        ))}
      </ul>
      <ClosedOutcome
        policy={claim.policy}
        status={claim.status}
        creditedCents={claim.creditedCents}
        refusalReason={claim.refusalReason}
      />
      <SupplierFinding policy={claim.policy} viewer="seller" />
      {canTellReason(claim) ? null : (
        <StatedReason policy={claim.policy} title="O que você contou" />
      )}
      <NextStep claim={claim} orderId={orderId} />
      <p className="text-footnote text-muted-foreground">
        <Link to="/politica-de-devolucao" className="underline underline-offset-2">
          Como funciona a devolução
        </Link>
      </p>
    </section>
  );
}
