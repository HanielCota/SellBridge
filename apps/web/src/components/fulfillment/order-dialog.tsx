import { type Dispatch, type SetStateAction, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SETTLED_FULFILLMENT_STATUSES } from "@sellbridge/shared/schemas";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fulfillmentQueryOptions } from "@/features/fulfillment/fulfillment.queries";
import {
  forwardOrderFn,
  restartOwnShipmentFn,
  revokeSupplierLinkFn,
  reforwardShipmentFn,
  rotateSupplierLinkFn,
  updateShipmentFn,
} from "@/features/fulfillment/fulfillment.functions";
import { refreshMarketplaceTrackingFn } from "@/features/fulfillment/marketplace.functions";
import { errorMessage } from "@/lib/errors";
import { ForwardForm } from "./forward-form";
import { ShipmentPanel } from "./shipment-panel";
import { useTabProfileLink } from "@/lib/tab-profile";
import { ShipmentActionHint, ShipmentActionIcon } from "./shipment-hints";

type Detail = Awaited<
  ReturnType<typeof import("@/features/fulfillment/fulfillment.functions").getFulfillmentFn>
>;
export function FulfillmentDialog({
  order,
  onClose,
}: {
  order: { id: string; externalOrderId: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(order)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Operar pedido {order?.externalOrderId}</DialogTitle>
          <DialogDescription>
            Prepare seus envios e acompanhe cada pacote até a entrega.
          </DialogDescription>
        </DialogHeader>
        {order ? <OrderOperations key={order.id} orderId={order.id} /> : null}
      </DialogContent>
    </Dialog>
  );
}
/** Each supplier's parcel, with the reseller's own controls: the link, and re-forwarding. */
function ShipmentList({
  detail,
  blocked,
  links,
  setLinks,
  refresh,
}: {
  detail: Detail;
  blocked: boolean;
  links: Record<string, SupplierLinkView>;
  setLinks: Dispatch<SetStateAction<Record<string, SupplierLinkView>>>;
  refresh: () => Promise<void>;
}) {
  return detail.shipments.map((shipment) => (
    <ShipmentPanel
      key={shipment.id}
      shipment={shipment}
      externalOrderId={detail.order.externalOrderId}
      blocked={blocked}
      onUpdate={async (input) => {
        await updateShipmentFn({ data: input });
        await refresh();
      }}
    >
      {/* The server re-forwards only parcels of a paid order: offered only then. */}
      {shipment.catalogKind === "seller" &&
      shipment.status === "cancelled" &&
      detail.order.status === "paid" ? (
        <OwnRestartButton shipmentId={shipment.id} onRestart={refresh} />
      ) : null}
      {shipment.catalogKind !== "seller" &&
      shipment.status === "cancelled" &&
      detail.order.status === "paid" ? (
        <ReforwardButton
          shipmentId={shipment.id}
          onLink={async (url) => {
            setLinks((previous) => ({ ...previous, [shipment.id]: { url, emailed: false } }));
            await refresh();
          }}
        />
      ) : null}
      {shipment.catalogKind === "seller" ? null : (
        <SupplierLink
          shipmentId={shipment.id}
          link={links[shipment.id]}
          closed={SETTLED_FULFILLMENT_STATUSES.includes(shipment.status)}
          onLink={(url) =>
            setLinks((previous) => ({ ...previous, [shipment.id]: { url, emailed: false } }))
          }
        />
      )}
    </ShipmentPanel>
  ));
}
/** Forwarding and every parcel of one order, with the reseller's controls. */
export function OrderOperations({ orderId }: { orderId: string }) {
  const query = useQuery(fulfillmentQueryOptions(orderId));
  const client = useQueryClient();
  const [links, setLinks] = useState<Record<string, SupplierLinkView>>({});
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["fulfillment", orderId] }),
      client.invalidateQueries({ queryKey: ["operations"] }),
      client.invalidateQueries({ queryKey: ["order-page", orderId] }),
      // A parcel can move the order itself (shipped, delivered, returned): its money and its
      // review show elsewhere too.
      client.invalidateQueries({ queryKey: ["order-reviews"] }),
      client.invalidateQueries({ queryKey: ["financials"] }),
      client.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  }
  async function onForwarded(result: Awaited<ReturnType<typeof forwardOrderFn>>) {
    setLinks(supplierLinks(result));
    await refresh();
  }
  if (query.isPending) return <p>Carregando pedido…</p>;
  if (query.isError)
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const detail = query.data;
  const blocked = ["cancelled", "returned", "pending"].includes(detail.order.status);
  return (
    <div className="space-y-5">
      <MarketplaceTools detail={detail} onRefresh={refresh} />
      {blocked ? (
        <p className="text-sm text-destructive">
          Pedido sem liberação para envio: pagamento pendente, cancelamento ou devolução.
        </p>
      ) : null}
      {detail.shipments.length === 0 && !blocked ? (
        <ForwardForm detail={detail} onForwarded={onForwarded} />
      ) : null}
      {detail.shipments.length > 0 ? (
        <ShipmentList
          detail={detail}
          blocked={blocked}
          links={links}
          setLinks={setLinks}
          refresh={refresh}
        />
      ) : null}
    </div>
  );
}
function MarketplaceActions({
  orderId,
  onRefresh,
}: {
  orderId: string;
  onRefresh: () => Promise<void>;
}) {
  const refresh = useMutation({
    mutationFn: () => refreshMarketplaceTrackingFn({ data: { orderId } }),
    onSuccess: async () => {
      await onRefresh();
      toast.success("Rastreio consultado no marketplace");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const withProfile = useTabProfileLink();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
        Atualizar rastreio do marketplace
      </Button>
      <Button variant="outline" asChild>
        <a
          href={withProfile(`/api/pedidos/${orderId}/etiqueta`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Gerar etiqueta de postagem do marketplace
        </a>
      </Button>
    </div>
  );
}
/** A supplier link shown after it was issued, and whether the supplier already got it by e-mail. */
interface SupplierLinkView {
  url: string;
  emailed: boolean;
}

function SupplierLink({
  shipmentId,
  link,
  closed,
  onLink,
}: {
  shipmentId: string;
  link: SupplierLinkView | undefined;
  closed: boolean;
  onLink: (url: string) => void;
}) {
  const mutation = useMutation({
    mutationFn: async (action: "create" | "revoke") => {
      if (action === "revoke") {
        await revokeSupplierLinkFn({ data: { shipmentId } });
        onLink("");
        return;
      }
      const result = await rotateSupplierLinkFn({ data: { shipmentId } });
      onLink(new URL(`/fornecedor/pedido/${result.token}`, window.location.origin).href);
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSuccess: () => toast.success("Acesso do fornecedor atualizado"),
  });
  // A settled parcel with no fresh link has nothing to show: no empty row in the toolbar.
  if (closed && !link?.url) return null;
  return (
    <div className="w-full space-y-2">
      {closed ? null : (
        // Wraps on phones: side by side, the two buttons are wider than a 320 px screen.
        <div className="flex flex-wrap gap-2">
          <ShipmentActionHint action="supplierLink" operator="reseller">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("create")}
            >
              <ShipmentActionIcon action="supplierLink" />
              Gerar novo link para fornecedor
            </Button>
          </ShipmentActionHint>
          <ShipmentActionHint action="revokeLink" operator="reseller">
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("revoke")}
            >
              <ShipmentActionIcon action="revokeLink" />
              Revogar acesso
            </Button>
          </ShipmentActionHint>
        </div>
      )}
      {link?.url ? <CopySupplierLink url={link.url} emailed={link.emailed} /> : null}
    </div>
  );
}
/** The one way forward for a parcel the supplier cancelled: send it again, with a new link. */
function ReforwardButton({
  shipmentId,
  onLink,
}: {
  shipmentId: string;
  onLink: (url: string) => Promise<void>;
}) {
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await reforwardShipmentFn({ data: { shipmentId } });
      await onLink(new URL(`/fornecedor/pedido/${result.token}`, window.location.origin).href);
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSuccess: () =>
      toast.success("Envio reencaminhado. Compartilhe o novo link com o fornecedor."),
  });
  return (
    <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      Reencaminhar ao fornecedor
    </Button>
  );
}
function OwnRestartButton({
  shipmentId,
  onRestart,
}: {
  shipmentId: string;
  onRestart: () => Promise<void>;
}) {
  const mutation = useMutation({
    mutationFn: async () => {
      await restartOwnShipmentFn({ data: { shipmentId } });
      await onRestart();
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSuccess: () => toast.success("Preparação retomada"),
  });
  return (
    <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      Retomar preparação
    </Button>
  );
}

function CopySupplierLink({ url, emailed }: { url: string; emailed: boolean }) {
  return (
    <div className="space-y-2">
      {emailed ? (
        <p className="text-xs font-medium text-foreground">
          Enviamos este link para o e-mail do fornecedor.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Compartilhe este link com o fornecedor para ele receber e atualizar o pedido. Válido por 30
        dias. Um novo link revoga o anterior.
      </p>
      <Input aria-label="Link do fornecedor" type="url" readOnly value={url} />
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success("Link copiado");
          } catch {
            toast.error("Copie o link no campo acima");
          }
        }}
      >
        Copiar link
      </Button>
    </div>
  );
}

function supplierLinks(result: Awaited<ReturnType<typeof forwardOrderFn>>) {
  return Object.fromEntries(
    result.map((link): [string, SupplierLinkView] => [
      link.shipmentId,
      {
        url: new URL(`/fornecedor/pedido/${link.token}`, window.location.origin).href,
        emailed: link.emailed,
      },
    ]),
  );
}

function MarketplaceTools({
  detail,
  onRefresh,
}: {
  detail: Detail;
  onRefresh: () => Promise<void>;
}) {
  if (detail.order.marketplace === "mercado_livre") {
    return <MarketplaceActions orderId={detail.order.id} onRefresh={onRefresh} />;
  }
  return (
    <p className="text-xs text-muted-foreground">
      Registre transportadora e rastreio em cada envio. A etiqueta de postagem é emitida pela
      transportadora contratada.
    </p>
  );
}
