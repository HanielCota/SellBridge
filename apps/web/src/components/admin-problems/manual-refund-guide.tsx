import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import { formatCents } from "@sellbridge/shared/money";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/integrations/copy-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { getManualRefundFn } from "@/features/supplier-payments/asaas.functions";
import { manualRefundQueryOptions } from "@/features/supplier-payments/asaas.queries";
import { errorMessage } from "@/lib/errors";

type ManualRefund = Awaited<ReturnType<typeof getManualRefundFn>>;

const fullDay = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: REPORT_TIME_ZONE,
});

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function ChargeFact({ chargeId }: { chargeId: string | null }) {
  if (chargeId === null) {
    return <span className="font-normal text-muted-foreground">Sem código registrado</span>;
  }
  return (
    <CopyButton value={chargeId} label="Copiar o código da cobrança">
      {chargeId}
    </CopyButton>
  );
}

function RefundFacts({ refund, deadline }: { refund: ManualRefund; deadline: string }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Fact label="Valor a devolver">{formatCents(refund.amountCents)}</Fact>
      <Fact label="Para quem">{`${refund.resellerName} (revendedor), pedido ${refund.orderNumber}`}</Fact>
      <Fact label="De onde sai">{`Conta Asaas do fornecedor ${refund.supplierName}`}</Fact>
      <Fact label="Devolver até">{deadline}</Fact>
      <Fact label="Taxa do SellBridge que saiu da conta">
        {formatCents(refund.platformFeeCents)}
      </Fact>
      <Fact label="Código da cobrança no Asaas">
        <ChargeFact chargeId={refund.chargeId} />
      </Fact>
    </dl>
  );
}

/** The reseller's ticket about the order, where the team says the money is on its way back. */
function ResellerTicket({ refund }: { refund: ManualRefund }) {
  if (refund.ticketId === null) {
    return (
      <p className="text-sm text-muted-foreground">
        O revendedor ainda não abriu chamado sobre este pedido. A tela do pedido dele já mostra o
        botão para pedir a devolução.
      </p>
    );
  }
  return (
    <Button asChild variant="outline" className="w-fit">
      <Link to="/suporte/$ticketId" params={{ ticketId: refund.ticketId }}>
        <ChatCircleDotsIcon aria-hidden="true" />
        Abrir o chamado do revendedor
      </Link>
    </Button>
  );
}

function RefundSteps({ refund }: { refund: ManualRefund }) {
  const amount = formatCents(refund.amountCents);
  const fee = formatCents(refund.platformFeeCents);
  const tariff = refund.paidByPix ? " e a tarifa do Pix cobrada pelo Asaas" : "";
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
      <li>
        No Asaas do SellBridge, abra <strong>Parceiros &gt; Subcontas</strong> e ache a conta do
        fornecedor {refund.supplierName}.
      </li>
      <li>
        Deixe {amount} livres nessa conta: libere o valor guardado desta cobrança e transfira do
        SellBridge o que faltar (a taxa de {fee}
        {tariff}).
      </li>
      <li>
        Na conta do fornecedor, abra <strong>Cobranças &gt; Todas</strong>, ache a cobrança pelo
        código acima e clique em <strong>Solicitar estorno</strong>, <strong>Avançar</strong> e{" "}
        <strong>Solicitar estorno</strong> de novo. Quem entra nessa conta é o fornecedor: peça a
        ele, ou ao gerente da conta no Asaas.
      </li>
      <li>
        Avise o revendedor no chamado. Quando o Asaas confirmar, o pagamento aparece como devolvido
        no pedido sozinho; aí marque este problema como resolvido.
      </li>
    </ol>
  );
}

function PendingRefund({ refund }: { refund: ManualRefund }) {
  const deadline = fullDay.format(new Date(refund.deadline));
  return (
    <>
      <p className="text-sm">
        O Asaas só devolve quando a conta do fornecedor tem o valor inteiro livre. A taxa do
        SellBridge já saiu dessa conta e o resto está guardado, então a devolução não sai sozinha:
        alguém da equipe faz no Asaas.
      </p>
      <p className="text-sm font-medium">
        {`Devolva até ${deadline}. Depois dessa data o Asaas libera o valor ao fornecedor.`}
      </p>
      <RefundFacts refund={refund} deadline={deadline} />
      <ResellerTicket refund={refund} />
      <h3 className="text-sm font-medium">Passo a passo</h3>
      <RefundSteps refund={refund} />
    </>
  );
}

/**
 * For a refund Asaas refused (a Pix whose fee and split left the supplier's account): the team
 * gives the money back by hand, so the problem says how much, to whom, from which account, until
 * when and the steps at Asaas.
 */
export function ManualRefundGuide({ shipmentPaymentId }: { shipmentPaymentId: string }) {
  const query = useQuery(manualRefundQueryOptions(shipmentPaymentId));
  if (query.isPending) {
    return <Skeleton className="h-64 rounded-3xl" />;
  }
  if (query.isError) {
    return <p className="text-sm text-destructive">{errorMessage(query.error)}</p>;
  }
  const refund = query.data;
  const amount = formatCents(refund.amountCents);
  return (
    <section className="surface-card grid gap-4 rounded-3xl bg-card p-5">
      <h2 className="text-subhead font-medium">{`Devolução manual de ${amount}`}</h2>
      {refund.refunded ? (
        <p className="text-sm">
          Este pagamento já foi devolvido ao revendedor. Pode marcar o problema como resolvido.
        </p>
      ) : (
        <PendingRefund refund={refund} />
      )}
    </section>
  );
}
