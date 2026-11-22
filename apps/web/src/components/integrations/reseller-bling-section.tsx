import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { IntegrationsSection } from "@/components/integrations/integrations-layout";
import { ResellerBlingForm } from "@/components/integrations/reseller-bling-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RESELLER_BLING_OUTCOME_MESSAGES,
  type ResellerBlingOutcome,
} from "@/features/reseller-bling/reseller-bling-connection";
import { disconnectResellerBlingFn } from "@/features/reseller-bling/reseller-bling.functions";
import {
  RESELLER_BLING_QUERY_KEY,
  resellerBlingQueryOptions,
} from "@/features/reseller-bling/reseller-bling.queries";
import { errorMessage } from "@/lib/errors";
import { useTabProfileLink } from "@/lib/tab-profile";
import { cn } from "@/lib/utils";

const CONNECT_PATH = "/api/integracoes/bling/revenda";

function OutcomeNotice({ outcome }: { outcome: ResellerBlingOutcome }) {
  const message = RESELLER_BLING_OUTCOME_MESSAGES[outcome];
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

function ConnectCard({ expired }: { expired: boolean }) {
  const withProfile = useTabProfileLink();
  return (
    <div className="surface-card grid gap-3 rounded-3xl bg-card p-5">
      <p className="text-sm text-muted-foreground">
        {expired
          ? "O Bling pediu para conectar de novo. Enquanto isso, as notas novas esperam o seu XML."
          : "Conecte o Bling da sua empresa e o SellBridge emite a nota de venda das vendas à ordem por lá, sem você enviar o XML."}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button asChild size="lg">
          <a href={withProfile(CONNECT_PATH)}>
            {expired ? "Conectar meu Bling de novo" : "Conectar meu Bling"}
          </a>
        </Button>
        <span className="text-sm text-muted-foreground">
          Leva 1 minuto. Você entra no Bling e autoriza.
        </span>
      </div>
    </div>
  );
}

function Disconnect() {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const disconnect = useMutation({
    mutationFn: async () => await disconnectResellerBlingFn(),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: RESELLER_BLING_QUERY_KEY }),
  });
  if (!asking) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 w-fit"
        onClick={() => setAsking(true)}
      >
        Desconectar o Bling
      </Button>
    );
  }
  return (
    <div className="grid gap-2 rounded-2xl bg-muted/60 p-4">
      <p className="text-sm">
        As notas de venda novas voltam a esperar o XML enviado por você. As que o Bling já emitiu
        continuam valendo.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          className="min-h-11"
          disabled={disconnect.isPending}
          onClick={() => disconnect.mutate()}
        >
          {disconnect.isPending ? "Desconectando…" : "Desconectar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => setAsking(false)}
        >
          Manter conectado
        </Button>
      </div>
      {disconnect.error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(disconnect.error)}
        </p>
      )}
    </div>
  );
}

function ResellerBlingContent() {
  const query = useQuery(resellerBlingQueryOptions());
  if (query.isPending) {
    return (
      <Skeleton className="h-40 rounded-3xl" aria-busy="true" aria-label="Carregando o Bling" />
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  const view = query.data;
  if (view.status === "not_company") {
    return (
      <p className="surface-card rounded-3xl bg-card p-5 text-sm text-muted-foreground">
        A nota de venda pelo Bling é para quem vende como empresa. Cadastre o CNPJ da sua empresa em
        Meu cadastro e volte aqui.
      </p>
    );
  }
  if (view.status === "not_connected" || view.status === "expired") {
    return <ConnectCard expired={view.status === "expired"} />;
  }
  return (
    <div className="surface-card grid gap-6 rounded-3xl bg-card p-5">
      <ResellerBlingForm view={view} />
      <Disconnect />
    </div>
  );
}

/**
 * "Nota de venda pelo Bling": the reseller selling as a company connects its own Bling and
 * chooses whether it issues the sale note of venda à ordem, with the note's fiscal settings.
 */
export function ResellerBlingSection({ outcome }: { outcome: ResellerBlingOutcome | undefined }) {
  const query = useQuery(resellerBlingQueryOptions());
  if (query.data?.status === "unavailable") {
    return null;
  }
  return (
    <IntegrationsSection
      id="bling"
      title="Nota de venda pelo Bling"
      description="Nas vendas à ordem, quem emite a nota para o comprador é a sua empresa. Escolha se você envia o XML ou se o seu Bling emite sozinho."
    >
      {outcome === undefined ? null : <OutcomeNotice outcome={outcome} />}
      <ResellerBlingContent />
    </IntegrationsSection>
  );
}
