import type { BlingExportView } from "@/features/supplier-panel/bling/bling-overview";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { BlingBadge } from "./bling-badge";

const integer = new Intl.NumberFormat("pt-BR");

function productCount(count: number, singular: string, plural: string): string {
  return `${integer.format(count)} ${count === 1 ? singular : plural}`;
}

type DoneExport = Extract<BlingExportView, { status: "done" }>;

function doneSummary(view: DoneExport): string {
  const created = productCount(view.created, "produto criado", "produtos criados");
  const existing = productCount(view.alreadyInErp, "já estava", "já estavam");
  return `${created} no Bling, ${existing} lá.`;
}

function RefusedProducts({ view }: { view: DoneExport }) {
  const hidden = view.refusedTotal - view.refused.length;
  return (
    <div className="grid gap-2 rounded-2xl bg-amber-500/10 p-4">
      <p className="text-sm font-medium">
        O Bling recusou {productCount(view.refusedTotal, "produto", "produtos")}. Corrija o cadastro
        no SellBridge e envie de novo:
      </p>
      <ul className="grid gap-1.5 text-sm">
        {view.refused.map((product) => (
          <li key={product.sku} className="break-words">
            <span className="font-medium">{product.title}</span>
            <span className="text-muted-foreground"> · código {product.sku}: </span>
            {product.reason}
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="text-sm text-muted-foreground">
          E mais {productCount(hidden, "produto", "produtos")} com recusa.
        </p>
      ) : null}
    </div>
  );
}

function SendingOutcome({ requestedAt }: { requestedAt: string }) {
  return (
    <output className="grid gap-1" aria-live="polite">
      <p className="text-sm font-medium">
        Enviando ao Bling os produtos que faltam lá (começou em{" "}
        {formatAbsoluteTime(new Date(requestedAt))}).
      </p>
      <p className="text-sm text-muted-foreground">
        Pode sair desta página: o resultado aparece aqui quando terminar.
      </p>
    </output>
  );
}

/** How the latest "Enviar ao Bling o que falta lá" went: running, done (with refusals) or failed. */
export function BlingExportOutcome({ view }: { view: BlingExportView }) {
  if (view.status === "sending") {
    return <SendingOutcome requestedAt={view.requestedAt} />;
  }
  const when = formatAbsoluteTime(new Date(view.finishedAt));
  if (view.status === "failed") {
    return (
      <div className="grid gap-1.5" role="alert">
        <div className="flex flex-wrap items-center gap-2">
          <BlingBadge tone="danger">Envio não concluído</BlingBadge>
          <span className="text-sm text-muted-foreground">em {when}</span>
        </div>
        <p className="text-sm font-medium">{view.reason}</p>
      </div>
    );
  }
  const refused = view.refusedTotal > 0;
  return (
    <div className="grid gap-2" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <BlingBadge tone={refused ? "warning" : "success"}>
          {refused ? "Enviado com recusas" : "Enviado"}
        </BlingBadge>
        <span className="text-sm text-muted-foreground">último envio em {when}</span>
      </div>
      <p className="text-sm">{doneSummary(view)}</p>
      {refused ? <RefusedProducts view={view} /> : null}
    </div>
  );
}
