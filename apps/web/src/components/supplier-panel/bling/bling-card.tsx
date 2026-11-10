import { PlugsConnectedIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import type {
  BlingConnectionView,
  BlingReadView,
} from "@/features/supplier-panel/bling/bling-overview";
import { useBlingActions } from "@/features/supplier-panel/bling/use-bling";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { BlingBadge } from "./bling-badge";

function connectHref(supplierId: string): string {
  return `/api/integracoes/bling/conectar?fornecedor=${encodeURIComponent(supplierId)}`;
}

function CardShell({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="bling-card-title"
      className="surface-card grid gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      {children}
    </section>
  );
}

function CardHeading({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="grid size-11 flex-none place-items-center rounded-2xl bg-brand/15 text-brand-text">
        <PlugsConnectedIcon aria-hidden="true" className="size-5" />
      </span>
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="bling-card-title" className="text-subhead font-medium">
            {title}
          </h2>
          {badge}
        </div>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/** No Bling account yet: one action, connect. */
export function BlingConnectCard({ supplierId }: { supplierId: string }) {
  return (
    <CardShell>
      <CardHeading title="Importar do Bling">
        Conecte sua conta Bling uma vez e traga os produtos com NCM, unidade, peso e estoque. O
        SellBridge só lê: nada muda no seu Bling.
      </CardHeading>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button asChild size="lg">
          <a href={connectHref(supplierId)}>Conectar Bling</a>
        </Button>
        <span className="text-sm text-muted-foreground">
          Leva 1 minuto. Você entra no Bling e autoriza.
        </span>
      </div>
    </CardShell>
  );
}

/** The ERP refused the saved access: the supplier authorizes again. */
export function BlingReconnectCard({
  supplierId,
  connection,
}: {
  supplierId: string;
  connection: BlingConnectionView;
}) {
  const expired = connection.status === "expired";
  return (
    <CardShell>
      <CardHeading
        title="Bling"
        badge={
          <BlingBadge tone={expired ? "warning" : "danger"}>
            {expired ? "Desconectado" : "Com erro"}
          </BlingBadge>
        }
      >
        O Bling parou de aceitar o acesso do SellBridge. Conecte de novo para voltar a importar; os
        produtos que você já importou continuam como estão.
      </CardHeading>
      <div>
        <Button asChild size="lg">
          <a href={connectHref(supplierId)}>Conectar de novo</a>
        </Button>
      </div>
    </CardShell>
  );
}

function connectionLine(connection: BlingConnectionView): string {
  const account = connection.accountName ?? "Bling";
  const since = `conectada em ${formatAbsoluteTime(new Date(connection.connectedAt))}`;
  const last =
    connection.lastImportAt === null
      ? "última importação: ainda nenhuma"
      : `última importação: ${formatAbsoluteTime(new Date(connection.lastImportAt))}`;
  return `Conta ${account} · ${since} · ${last}`;
}

function ReadProgress({ read }: { read: BlingReadView }) {
  const total = read.totalProducts;
  const label =
    total === null
      ? "Contando os produtos do seu Bling…"
      : `Lendo ${read.readProducts} de ${total} produtos…`;
  return (
    <output className="grid gap-2" aria-live="polite">
      <p className="text-sm font-medium">{label}</p>
      <progress
        aria-label="Leitura do Bling"
        value={read.readProducts}
        max={Math.max(total ?? 1, 1)}
        className="h-1.5 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand"
      />
      <p className="text-sm text-muted-foreground">
        Pode sair desta página: a leitura continua e a prévia aparece aqui quando terminar.
      </p>
    </output>
  );
}

function DisconnectLink({ supplierId }: { supplierId: string }) {
  const [open, setOpen] = useState(false);
  const { disconnect } = useBlingActions(supplierId);
  return (
    <>
      <Button
        variant="link"
        className="h-11 px-0 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        Desconectar
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Desconectar o Bling?"
        description="O SellBridge deixa de ler o seu Bling. Os produtos que você já importou continuam no SellBridge, e você pode conectar de novo quando quiser."
        confirmLabel="Desconectar"
        pendingLabel="Desconectando…"
        isPending={disconnect.isPending}
        destructive
        onConfirm={() =>
          disconnect.mutate(undefined, {
            onSuccess: () => {
              setOpen(false);
              toast.success("Bling desconectado. Seus produtos continuam no SellBridge.");
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
    </>
  );
}

function ConnectedActions({ supplierId }: { supplierId: string }) {
  const { startRead, sendCatalog } = useBlingActions(supplierId);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button
        size="lg"
        disabled={startRead.isPending}
        onClick={() =>
          startRead.mutate(undefined, { onError: (error) => toast.error(errorMessage(error)) })
        }
      >
        {startRead.isPending ? "Começando…" : "Importar do Bling"}
      </Button>
      <Button
        variant="outline"
        size="lg"
        disabled={sendCatalog.isPending}
        onClick={() =>
          sendCatalog.mutate(undefined, {
            onSuccess: () =>
              toast.success(
                "Pronto: vamos criar no Bling os produtos que faltam lá. Leva alguns minutos.",
              ),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      >
        {sendCatalog.isPending ? "Enviando…" : "Enviar ao Bling o que falta lá"}
      </Button>
      <DisconnectLink supplierId={supplierId} />
    </div>
  );
}

/** Connected: import, send the missing products, follow a read or see why it failed. */
export function BlingConnectedCard(props: {
  supplierId: string;
  connection: BlingConnectionView;
  read: BlingReadView | null;
}) {
  const { read } = props;
  return (
    <CardShell>
      <CardHeading title="Bling" badge={<BlingBadge tone="success">Conectado</BlingBadge>}>
        {connectionLine(props.connection)}
      </CardHeading>
      {read?.status === "reading" ? (
        <ReadProgress read={read} />
      ) : (
        <ConnectedActions supplierId={props.supplierId} />
      )}
      {read?.status === "failed" ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {read.error ?? "Não foi possível ler o seu Bling. Tente de novo."}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        &ldquo;Enviar ao Bling&rdquo; só cria lá os produtos que ainda não existem. Nada do que já
        está no seu Bling é alterado.
      </p>
    </CardShell>
  );
}
