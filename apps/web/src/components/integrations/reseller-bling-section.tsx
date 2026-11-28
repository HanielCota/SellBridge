import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { ResellerBlingForm } from "@/components/integrations/reseller-bling-form";
import { BlingBadge } from "@/components/supplier-panel/bling/bling-badge";
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

function ConnectStep({ expired }: { expired: boolean }) {
  const withProfile = useTabProfileLink();
  return (
    <div className="grid gap-3">
      {expired ? (
        <p className="text-sm text-muted-foreground">
          O Bling pediu para conectar de novo. Enquanto isso, as notas novas esperam o arquivo da
          nota (XML) enviado por você.
        </p>
      ) : null}
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

/** Without a CNPJ there is no company note: the one way out is the details step, then back here. */
function CompanyNeededStep() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button asChild size="lg">
        <Link
          to="/onboarding"
          search={{ step: "details", flow: "setup", redirect: "/integracoes" }}
        >
          Cadastrar CNPJ
        </Link>
      </Button>
      <span className="text-sm text-muted-foreground">
        Leva 1 minuto. Depois você volta para cá.
      </span>
    </div>
  );
}

const BLING_BADGES = {
  not_company: <BlingBadge tone="warning">Falta o CNPJ</BlingBadge>,
  not_connected: <BlingBadge tone="neutral">Não conectado</BlingBadge>,
  expired: <BlingBadge tone="warning">Precisa reconectar</BlingBadge>,
  connected: <BlingBadge tone="success">Conectado</BlingBadge>,
} as const;

function ResellerBlingContent() {
  const query = useQuery(resellerBlingQueryOptions());
  if (query.isPending) {
    return (
      <Skeleton className="h-24 rounded-2xl" aria-busy="true" aria-label="Carregando o Bling" />
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  const view = query.data;
  if (view.status === "not_company") return <CompanyNeededStep />;
  if (view.status === "not_connected" || view.status === "expired") {
    return <ConnectStep expired={view.status === "expired"} />;
  }
  return (
    <div className="grid gap-6">
      <ResellerBlingForm view={view} />
      <Disconnect />
    </div>
  );
}

function BlingHeading({ badge }: { badge: ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <img
        src="/integrations/bling.png"
        alt=""
        width={192}
        height={192}
        draggable={false}
        className="size-11 flex-none rounded-2xl"
      />
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="bling-titulo" className="text-subhead font-medium">
            Bling
          </h2>
          {badge}
        </div>
        <p className="text-sm text-muted-foreground">
          Quando você vende, a nota para o comprador sai no nome da sua empresa. Ligue o seu Bling e
          ela sai sozinha, sem você enviar arquivo.
        </p>
      </div>
    </div>
  );
}

/**
 * The reseller selling as a company connects its own Bling, which then issues the sale note of
 * venda à ordem; the card says where it stands and offers the one step that moves it forward.
 */
export function ResellerBlingSection({ outcome }: { outcome: ResellerBlingOutcome | undefined }) {
  const query = useQuery(resellerBlingQueryOptions());
  const status = query.data?.status;
  if (status === "unavailable") {
    return null;
  }
  return (
    <section
      id="bling"
      aria-labelledby="bling-titulo"
      className="surface-card grid scroll-mt-28 gap-5 rounded-3xl bg-card p-5 sm:p-6"
    >
      <BlingHeading badge={status === undefined ? null : BLING_BADGES[status]} />
      {outcome === undefined ? null : <OutcomeNotice outcome={outcome} />}
      <ResellerBlingContent />
    </section>
  );
}
