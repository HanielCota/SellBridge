import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { DotTimeline, DotTimelineItem } from "@/components/data/dot-timeline";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { Skeleton } from "@/components/ui/skeleton";
import { buyerTrackingQueryOptions } from "@/features/buyer-tracking/buyer-tracking.queries";
import type { BuyerTrackingView } from "@/features/buyer-tracking/buyer-tracking-view";
import { ParcelCodeBox, ParcelProgress } from "./parcel-parts";

const ORDER_DAY = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** The store's page, not SellBridge's: no app navigation, just the store and the parcel. */
function BuyerFrame({ storeName, children }: { storeName: string | null; children: ReactNode }) {
  return (
    <div className="min-h-svh bg-surface-grouped">
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl space-y-4 px-4 py-6 pb-16">
        {storeName === null ? null : <p className="text-lg font-semibold">{storeName}</p>}
        {children}
      </main>
    </div>
  );
}

function Card({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="surface-card space-y-4 rounded-3xl bg-card p-5">
      {children}
    </section>
  );
}

function BuyerHistory({ view }: { view: BuyerTrackingView }) {
  if (view.history.length === 0) {
    return null;
  }
  return (
    <Card label="Por onde passou">
      <h2 className="text-subhead font-semibold">Por onde passou</h2>
      <DotTimeline>
        {view.history.map((entry) => (
          <DotTimelineItem
            key={entry.key}
            dotClassName={TONE_DOT_CLASSES[entry.tone]}
            date={entry.at}
          >
            <span className="block text-sm font-medium text-foreground">{entry.label}</span>
            {entry.place === null ? null : (
              <span className="block text-muted-foreground">{entry.place}</span>
            )}
          </DotTimelineItem>
        ))}
      </DotTimeline>
    </Card>
  );
}

function BuyerParcel({ view }: { view: BuyerTrackingView }) {
  return (
    <>
      <div className="-mt-2 text-sm text-muted-foreground">
        Pedido {view.externalOrderId} · {ORDER_DAY.format(view.orderedAt)}
      </div>
      <Card label="Situação do pedido">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{view.headline}</h1>
          {view.subline === null ? null : (
            <p className="text-sm text-muted-foreground">{view.subline}</p>
          )}
        </div>
        {view.progress === null ? null : <ParcelProgress steps={view.progress} />}
        {view.trackingCode === null ? null : (
          <ParcelCodeBox carrier={view.carrier} code={view.trackingCode} url={view.trackingUrl} />
        )}
      </Card>
      <BuyerHistory view={view} />
      <Card label="Detalhes do pacote">
        {view.destination === null ? null : (
          <div className="space-y-0.5">
            <p className="text-footnote text-muted-foreground">Vai para</p>
            <p className="text-sm">{view.destination}</p>
          </div>
        )}
        <div className="space-y-0.5">
          <p className="text-footnote text-muted-foreground">No pacote</p>
          <ul className="text-sm">
            {view.items.map((item) => (
              <li key={item.title}>
                {item.quantity}× {item.title}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </>
  );
}

/** `/rastreio/<token>`: what the buyer sees from the link the store sent. */
export function BuyerTrackingPage({ token }: { token: string }) {
  const query = useQuery(buyerTrackingQueryOptions(token));
  if (query.isPending) {
    return (
      <BuyerFrame storeName={null}>
        <output className="block space-y-4" aria-busy="true" aria-label="Carregando rastreio">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-64 rounded-3xl" />
        </output>
      </BuyerFrame>
    );
  }
  if (query.isError || query.data === null) {
    return (
      <BuyerFrame storeName={null}>
        <Card>
          <h1 className="text-xl font-semibold">Link de rastreio inválido</h1>
          <p className="text-sm text-muted-foreground">
            Confira se o link foi copiado inteiro ou peça um novo para a loja onde você comprou.
          </p>
        </Card>
      </BuyerFrame>
    );
  }
  return (
    <BuyerFrame storeName={query.data.storeName}>
      <BuyerParcel view={query.data} />
    </BuyerFrame>
  );
}
