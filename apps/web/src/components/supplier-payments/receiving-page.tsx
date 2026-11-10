import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFeePercent } from "@/features/supplier-payments/fee-percent";
import {
  MERCADO_PAGO_OUTCOME_MESSAGES,
  type MercadoPagoConnectOutcome,
} from "@/features/supplier-payments/mercado-pago-connection";
import {
  getPaymentAccountFn,
  unlinkPaymentAccountFn,
} from "@/features/supplier-payments/supplier-payments.functions";
import { paymentAccountQueryOptions } from "@/features/supplier-payments/supplier-payments.queries";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { PaymentPill } from "./supplier-payment-badge";

type AccountView = Awaited<ReturnType<typeof getPaymentAccountFn>>;

function connectHref(supplierId: string): string {
  return `/api/integracoes/mercado-pago/conectar?fornecedor=${encodeURIComponent(supplierId)}`;
}

function OutcomeNotice({ outcome }: { outcome: MercadoPagoConnectOutcome }) {
  const message = MERCADO_PAGO_OUTCOME_MESSAGES[outcome];
  return (
    <p
      role={message.ok ? "status" : "alert"}
      className={cn(
        "rounded-2xl px-4 py-3 text-sm font-medium",
        message.ok
          ? "bg-emerald-500/14 text-emerald-800 dark:text-emerald-300"
          : "bg-destructive/10 text-destructive",
      )}
    >
      {message.text}
    </p>
  );
}

function CardShell({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="mercado-pago-card-title"
      className="surface-card grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      {children}
    </section>
  );
}

function CardHeading({ badge, children }: { badge: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <span
        aria-hidden="true"
        className="grid size-11 flex-none place-items-center rounded-2xl bg-sky-100 text-sm font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      >
        MP
      </span>
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="mercado-pago-card-title" className="text-subhead font-medium">
            Mercado Pago
          </h2>
          {badge}
        </div>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function LinkCard({ supplierId, fee }: { supplierId: string; fee: string }) {
  return (
    <CardShell>
      <CardHeading badge={<PaymentPill tone="neutral">Não ligada</PaymentPill>}>
        Quando o revendedor paga um pedido, o Mercado Pago desconta a tarifa dele, o SellBridge fica
        com {fee} e o resto cai na sua conta Mercado Pago. Você saca quando quiser.
      </CardHeading>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button asChild size="lg">
          <a href={connectHref(supplierId)}>Ligar conta Mercado Pago</a>
        </Button>
        <span className="text-sm text-muted-foreground">
          Leva 1 minuto. Você entra no Mercado Pago e autoriza.
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Sem a conta ligada, os pedidos continuam chegando e o revendedor paga você por fora, como
        hoje.
      </p>
    </CardShell>
  );
}

function ErrorCard({ supplierId, since }: { supplierId: string; since: string | null }) {
  return (
    <CardShell>
      <CardHeading
        badge={
          <PaymentPill tone="danger">
            {since === null ? "Com erro" : `Com erro · ${formatAbsoluteTime(new Date(since))}`}
          </PaymentPill>
        }
      >
        <span className="text-foreground">
          O Mercado Pago não deixou o SellBridge receber em seu nome (a autorização foi cancelada ou
          venceu). Até ligar de novo, os revendedores pagam você por fora.
        </span>
      </CardHeading>
      <div>
        <Button asChild size="lg">
          <a href={connectHref(supplierId)}>Ligar de novo</a>
        </Button>
      </div>
    </CardShell>
  );
}

function UnlinkButton({ supplierId }: { supplierId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const unlink = useMutation({
    mutationFn: () => unlinkPaymentAccountFn({ data: { supplierId } }),
    onSuccess: async () => {
      setOpen(false);
      toast.success("Conta Mercado Pago desligada. Os próximos pedidos você recebe por fora.");
      await queryClient.invalidateQueries({
        queryKey: paymentAccountQueryOptions(supplierId).queryKey,
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <>
      <Button
        variant="link"
        className="h-11 px-0 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        Desligar a conta
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Desligar a conta Mercado Pago?"
        description="Os revendedores deixam de pagar você pelo SellBridge: os próximos pedidos você recebe por fora. O que já foi pago continua na sua conta Mercado Pago, e você pode ligar de novo quando quiser."
        confirmLabel="Desligar a conta"
        pendingLabel="Desligando…"
        isPending={unlink.isPending}
        destructive
        onConfirm={() => unlink.mutate()}
      />
    </>
  );
}

function LinkedCard({
  supplierId,
  fee,
  since,
}: {
  supplierId: string;
  fee: string;
  since: string | null;
}) {
  return (
    <CardShell>
      <CardHeading
        badge={
          <PaymentPill tone="success">
            {since === null ? "✓ Ligada" : `✓ Ligada · ${formatAbsoluteTime(new Date(since))}`}
          </PaymentPill>
        }
      >
        Os revendedores já podem pagar seus pedidos com Pix ou cartão. A cada pagamento, o
        SellBridge fica com {fee} e o resto cai na sua conta Mercado Pago.
      </CardHeading>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <a
          href="https://www.mercadopago.com.br/activities"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center text-sm text-foreground underline underline-offset-4"
        >
          Ver meu saldo no Mercado Pago
        </a>
        <UnlinkButton supplierId={supplierId} />
      </div>
    </CardShell>
  );
}

function AccountCard({ supplierId, account }: { supplierId: string; account: AccountView }) {
  const fee = formatFeePercent(account.feeBasisPoints);
  if (account.status === "connected") {
    return <LinkedCard supplierId={supplierId} fee={fee} since={account.connectedAt} />;
  }
  if (account.status === "error" || account.status === "expired") {
    return <ErrorCard supplierId={supplierId} since={account.updatedAt} />;
  }
  return <LinkCard supplierId={supplierId} fee={fee} />;
}

function UnavailableCard() {
  return (
    <CardShell>
      <CardHeading badge={<PaymentPill tone="neutral">Em breve</PaymentPill>}>
        O pagamento pelo Mercado Pago ainda não foi ligado no SellBridge. Enquanto isso, os
        revendedores pagam você por fora, como hoje.
      </CardHeading>
    </CardShell>
  );
}

/** The supplier links the Mercado Pago account that receives the resellers' payments. */
export function ReceivingPage({
  supplierId,
  outcome,
}: {
  supplierId: string;
  outcome: MercadoPagoConnectOutcome | undefined;
}) {
  const query = useQuery(paymentAccountQueryOptions(supplierId));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Receber pagamentos"
        description="Ligue sua conta Mercado Pago para receber dos revendedores pelo SellBridge."
      />
      {outcome === undefined ? null : <OutcomeNotice outcome={outcome} />}
      {query.isPending ? <Skeleton className="h-44 max-w-3xl rounded-3xl" /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data === undefined ? null : query.data.available ? (
        <AccountCard supplierId={supplierId} account={query.data} />
      ) : (
        <UnavailableCard />
      )}
    </div>
  );
}
