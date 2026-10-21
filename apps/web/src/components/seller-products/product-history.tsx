import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  adminInspectSellerProductFn,
  adminPauseSellerPublicationsFn,
} from "@/features/seller-products/products.functions";
import {
  SELLER_PRODUCT_ACTION_LABELS,
  productAuditFields,
} from "@/features/seller-products/action-labels";
import { errorMessage } from "@/lib/errors";
import { LISTING_STATUS_LABELS } from "@sellbridge/shared/schemas";

type Inspection = Awaited<ReturnType<typeof adminInspectSellerProductFn>>;

function Publications({ items }: { items: Inspection["publications"] }) {
  if (items.length === 0) return <p>Nenhum anúncio publicado nos marketplaces.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-border p-3">
          <strong>{item.storeName}</strong> · {LISTING_STATUS_LABELS[item.status]}
          <p>{item.title}</p>
          {item.error ? <p className="text-destructive">{item.error}</p> : null}
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer">
              Ver anúncio no marketplace
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function AuditHistory({ items }: { items: Inspection["history"] }) {
  return (
    <>
      <h2 className="text-xl font-semibold">Histórico administrativo</h2>
      <ol className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-border p-3">
            <p>
              {item.actor ?? "Administrador removido"} ·{" "}
              {SELLER_PRODUCT_ACTION_LABELS[item.action] ?? "Produto atualizado"} ·{" "}
              <time dateTime={item.createdAt.toISOString()}>
                {item.createdAt.toLocaleString("pt-BR")}
              </time>
            </p>
            <p>{String(item.details?.reason ?? "")}</p>
            {item.details?.fields ? <p>Campos: {productAuditFields(item.details.fields)}</p> : null}
          </li>
        ))}
      </ol>
    </>
  );
}

export function AdminProductHistory({
  tenantId,
  productId,
  reason,
  canAct,
}: {
  tenantId: string;
  productId: string;
  reason: string;
  canAct: boolean;
}) {
  const inspection = useQuery({
    queryKey: ["admin-catalog", "inspection", tenantId, productId],
    queryFn: () => adminInspectSellerProductFn({ data: { tenantId, productId } }),
  });
  const action = useMutation({
    mutationFn: (paused: boolean) =>
      adminPauseSellerPublicationsFn({ data: { tenantId, productId, reason, paused } }),
    onSuccess: async () => {
      await inspection.refetch();
    },
  });
  if (inspection.isPending) return <output>Carregando anúncios e histórico…</output>;
  if (inspection.isError) return <p role="alert">{errorMessage(inspection.error)}</p>;
  return (
    <section
      className="surface-card space-y-5 rounded-3xl bg-card p-6"
      aria-label="Ações e histórico do produto"
    >
      <h2 className="text-xl font-semibold">Anúncios nos marketplaces</h2>
      <Publications items={inspection.data.publications} />
      {inspection.data.publications.length > 0 ? (
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={!canAct || reason.trim().length < 5 || action.isPending}
            onClick={() => action.mutate(true)}
          >
            Pausar anúncios
          </Button>
          <Button
            variant="outline"
            disabled={!canAct || reason.trim().length < 5 || action.isPending}
            onClick={() => action.mutate(false)}
          >
            Reativar anúncios
          </Button>
        </div>
      ) : null}
      {action.isError ? <p role="alert">{errorMessage(action.error)}</p> : null}
      <AuditHistory items={inspection.data.history} />
    </section>
  );
}
