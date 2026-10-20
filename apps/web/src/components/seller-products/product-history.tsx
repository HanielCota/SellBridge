import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  adminInspectSellerProductFn,
  adminPauseSellerPublicationsFn,
} from "@/features/seller-products/products.functions";
import { SELLER_PRODUCT_ACTION_LABELS } from "@/features/seller-products/action-labels";
import { errorMessage } from "@/lib/errors";

type Inspection = Awaited<ReturnType<typeof adminInspectSellerProductFn>>;

function Publications({ items }: { items: Inspection["publications"] }) {
  if (items.length === 0) return <p>No marketplace publications yet.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-border p-3">
          <strong>{item.storeName}</strong> · {item.status}
          <p>{item.title}</p>
          {item.error ? <p className="text-destructive">{item.error}</p> : null}
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer">
              View marketplace listing
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
      <h2 className="text-xl font-semibold">Administrative history</h2>
      <ol className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-border p-3">
            <p>
              {item.actor ?? "Former administrator"} ·{" "}
              {SELLER_PRODUCT_ACTION_LABELS[item.action] ?? "Updated product"} ·{" "}
              <time dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleString()}</time>
            </p>
            <p>{String(item.details?.reason ?? "")}</p>
            {item.details?.fields ? <p>Fields: {String(item.details.fields)}</p> : null}
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
  if (inspection.isPending) return <output>Loading publications and history…</output>;
  if (inspection.isError) return <p role="alert">{errorMessage(inspection.error)}</p>;
  return (
    <section
      className="surface-card space-y-5 rounded-3xl bg-card p-6"
      aria-label="Product operations and audit history"
    >
      <h2 className="text-xl font-semibold">Marketplace publications</h2>
      <Publications items={inspection.data.publications} />
      {inspection.data.publications.length > 0 ? (
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={!canAct || reason.trim().length < 5 || action.isPending}
            onClick={() => action.mutate(true)}
          >
            Pause publications
          </Button>
          <Button
            variant="outline"
            disabled={!canAct || reason.trim().length < 5 || action.isPending}
            onClick={() => action.mutate(false)}
          >
            Resume publications
          </Button>
        </div>
      ) : null}
      {action.isError ? <p role="alert">{errorMessage(action.error)}</p> : null}
      <AuditHistory items={inspection.data.history} />
    </section>
  );
}
