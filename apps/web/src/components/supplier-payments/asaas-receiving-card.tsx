import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryAsaasProtectionFn } from "@/features/supplier-payments/asaas.functions";
import { asaasReceivingQueryOptions } from "@/features/supplier-payments/asaas.queries";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { AsaasAccountDialog } from "./asaas-account-dialog";
import { PaymentPill } from "./supplier-payment-badge";

export type AsaasReceivingView = Awaited<
  ReturnType<typeof import("@/features/supplier-payments/asaas.functions").getAsaasReceivingFn>
>;

function Shell({ badge, children }: { badge: ReactNode; children: ReactNode }) {
  return (
    <section
      aria-labelledby="asaas-card-title"
      className="surface-card grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="grid size-11 flex-none place-items-center rounded-2xl bg-emerald-100 text-sm font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          AS
        </span>
        <div className="grid min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="asaas-card-title" className="text-subhead font-medium">
              Receber com proteção (Asaas)
            </h2>
            {badge}
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

function HowItWorks({ fee }: { fee: string }) {
  return (
    <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
      <li>O revendedor paga e o dinheiro fica guardado no Asaas.</li>
      <li>7 dias depois da entrega confirmada, o dinheiro é liberado para você.</li>
      <li>
        As tarifas do Asaas saem da sua parte e o SellBridge fica com {fee}. Se o pedido for
        cancelado ou devolvido antes, o revendedor recebe o dinheiro de volta.
      </li>
    </ol>
  );
}

function OpenCard({ supplierId, fee }: { supplierId: string; fee: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Shell badge={<PaymentPill tone="neutral">Não aberta</PaymentPill>}>
      <HowItWorks fee={fee} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button size="lg" onClick={() => setOpen(true)}>
          Abrir minha conta no Asaas
        </Button>
        <span className="text-sm text-muted-foreground">Leva uns 3 minutos.</span>
      </div>
      <AsaasAccountDialog supplierId={supplierId} open={open} onOpenChange={setOpen} />
    </Shell>
  );
}

function RetryProtection({ supplierId }: { supplierId: string }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => retryAsaasProtectionFn({ data: { supplierId } }),
    onSuccess: async ({ protectedNow }) => {
      if (protectedNow) {
        toast.success("Proteção ligada. Falta só a aprovação do Asaas.");
      }
      if (!protectedNow) {
        toast.error("O Asaas ainda não ligou a proteção. Nossa equipe já foi avisada.");
      }
      await queryClient.invalidateQueries({
        queryKey: asaasReceivingQueryOptions(supplierId).queryKey,
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Shell badge={<PaymentPill tone="danger">Proteção desligada</PaymentPill>}>
      <p className="text-sm">
        Sua conta foi aberta, mas o Asaas ainda não ligou a proteção. Sem ela, você não recebe por
        aqui.
      </p>
      <div>
        <Button size="lg" disabled={retry.isPending} onClick={() => retry.mutate()}>
          {retry.isPending ? "Ligando…" : "Ligar a proteção"}
        </Button>
      </div>
    </Shell>
  );
}

function DocumentsLink({ url, label }: { url: string | null; label: string }) {
  if (url === null) {
    return (
      <p className="text-sm text-muted-foreground">
        O Asaas mandou um e-mail para você com o link para enviar os documentos.
      </p>
    );
  }
  return (
    <div>
      <Button asChild size="lg">
        <a href={url} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      </Button>
    </div>
  );
}

function ReviewCard({ view }: { view: NonNullable<AsaasReceivingView["asaas"]> }) {
  if (view.reviewStatus === "rejected") {
    return (
      <Shell badge={<PaymentPill tone="danger">Documentos recusados</PaymentPill>}>
        <p className="text-sm">
          O Asaas não aprovou os documentos. Veja no e-mail do Asaas o motivo e envie de novo.
        </p>
        <DocumentsLink url={view.documentsUrl} label="Enviar os documentos de novo" />
      </Shell>
    );
  }
  const waiting = view.reviewStatus === "awaiting_approval";
  return (
    <Shell
      badge={
        <PaymentPill tone="warning">
          {waiting ? "Documentos em análise" : "Falta enviar os documentos"}
        </PaymentPill>
      }
    >
      <p className="text-sm">
        {waiting
          ? "O Asaas está conferindo seus documentos. Leva até 2 dias úteis; você recebe um e-mail quando aprovar."
          : "Para receber, envie uma foto do seu documento e uma selfie no site do Asaas."}
      </p>
      {waiting ? null : (
        <DocumentsLink url={view.documentsUrl} label="Enviar documentos no Asaas" />
      )}
    </Shell>
  );
}

function ApprovedCard({ fee, since }: { fee: string; since: string }) {
  return (
    <Shell
      badge={
        <PaymentPill tone="success">{`✓ Aprovada · ${formatAbsoluteTime(new Date(since))}`}</PaymentPill>
      }
    >
      <HowItWorks fee={fee} />
      <a
        href="https://www.asaas.com/login"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 w-fit items-center text-sm text-foreground underline underline-offset-4"
      >
        Ver meu saldo no Asaas
      </a>
    </Shell>
  );
}

/** The supplier's Asaas account on Recebimentos: open it, send documents, see it approved. */
export function AsaasReceivingCard(props: {
  supplierId: string;
  view: AsaasReceivingView;
  fee: string;
}) {
  const { asaas } = props.view;
  if (!props.view.available) {
    return (
      <Shell badge={<PaymentPill tone="neutral">Em breve</PaymentPill>}>
        <p className="text-sm text-muted-foreground">
          O recebimento com proteção ainda não foi ligado no SellBridge.
        </p>
      </Shell>
    );
  }
  if (asaas === null) {
    return <OpenCard supplierId={props.supplierId} fee={props.fee} />;
  }
  if (asaas.protectionMissing) {
    return <RetryProtection supplierId={props.supplierId} />;
  }
  if (asaas.reviewStatus !== "approved") {
    return <ReviewCard view={asaas} />;
  }
  return <ApprovedCard fee={props.fee} since={asaas.connectedAt} />;
}
