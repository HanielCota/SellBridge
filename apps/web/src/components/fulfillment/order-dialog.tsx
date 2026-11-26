import { type Dispatch, type SetStateAction, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SETTLED_FULFILLMENT_STATUSES } from "@sellbridge/shared/schemas";
import { REFORWARD_BLOCK_MESSAGES } from "@sellbridge/shared/shipment-payments";
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
import { isShippingBlocked } from "@/features/fulfillment/shipping-block";
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
import { ResellerInvoiceCard } from "./reseller-invoice-card";
import { ResellerSaleNoteCard } from "./reseller-sale-note-card";
import { ShipmentPanel } from "./shipment-panel";
import { ResellerSupplierPayment } from "@/components/supplier-payments/reseller-supplier-payment";
import { CancelMoneyNote } from "@/components/supplier-payments/cancel-money-note";
import { asksForSaleNote } from "@/features/fulfillment/sale-note-request";
import { resellerSupplierPaymentQueryOptions } from "@/features/supplier-payments/supplier-payments.queries";
import { TrackParcelLink } from "@/components/tracking/track-parcel-link";
import { useTabProfileLink } from "@/lib/tab-profile";
import { attentionCountsQueryOptions } from "@/features/navigation/navigation.queries";
import { blockedOrderMessage } from "@/features/fulfillment/shipment-timeline";
import { ShipmentActionHint, ShipmentActionIcon } from "./shipment-hints";
import { SplitOrderNotice } from "./split-order-notice";

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
          <DialogTitle>Pedido {order?.externalOrderId}</DialogTitle>
          <DialogDescription>
            Mande ao fornecedor e acompanhe cada pacote até a entrega.
          </DialogDescription>
        </DialogHeader>
        {order ? <OrderOperations key={order.id} orderId={order.id} /> : null}
      </DialogContent>
    </Dialog>
  );
}
function paymentLine(shipment: Detail["shipments"][number]) {
  return shipment.catalogKind === "seller" ? null : (
    <ResellerSupplierPayment shipmentId={shipment.id} />
  );
}
/** What cancelling does to the money paid to the supplier; none for the reseller's own stock. */
function cancelNoteFor(shipment: Detail["shipments"][number]) {
  return shipment.catalogKind === "seller" ? null : (
    <CancelMoneyNote shipmentId={shipment.id} parcelStatus={shipment.status} />
  );
}
/** In venda à ordem the reseller's own note comes first: the supplier's notes wait for it. */
function invoiceCards(
  order: { id: string; marketplace: string },
  shipment: Detail["shipments"][number],
  refresh: () => Promise<void>,
) {
  const orderId = order.id;
  if (shipment.invoice === null && shipment.resellerNote === null) {
    return null;
  }
  return (
    <>
      {shipment.resellerNote === null ||
      !asksForSaleNote(shipment.status, shipment.resellerNote) ? null : (
        <ResellerSaleNoteCard
          shipmentId={shipment.id}
          marketplace={order.marketplace}
          note={shipment.resellerNote}
          onSaved={refresh}
        />
      )}
      {shipment.invoice === null ? null : (
        <ResellerInvoiceCard
          orderId={orderId}
          shipmentId={shipment.id}
          invoice={shipment.invoice}
          noteRole={shipment.resellerNote === null ? "direct" : "remessa"}
        />
      )}
      {shipment.purchaseInvoice === null ? null : (
        <ResellerInvoiceCard
          orderId={orderId}
          shipmentId={shipment.id}
          invoice={shipment.purchaseInvoice}
          noteRole="purchase"
        />
      )}
    </>
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
      // A parcel waiting for the supplier's account or the payment cannot be moved for it either.
      blocked={blocked || shipment.preparationHold !== null}
      payment={paymentLine(shipment)}
      cancelNote={cancelNoteFor(shipment)}
      invoice={invoiceCards(detail.order, shipment, refresh)}
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
          supplierHasPanel={shipment.supplierHasPanel}
          onLink={async (url) => {
            setLinks((previous) => ({ ...previous, [shipment.id]: { url, emailed: false } }));
            await refresh();
          }}
        />
      ) : null}
      {shipment.trackingCode === null ? null : <TrackParcelLink orderId={detail.order.id} />}
      {shipment.catalogKind === "seller" ? null : (
        <SupplierAccess
          shipment={shipment}
          link={links[shipment.id]}
          onLink={(url) =>
            setLinks((previous) => ({ ...previous, [shipment.id]: { url, emailed: false } }))
          }
        />
      )}
    </ShipmentPanel>
  ));
}
/** Why a blocked order cannot be forwarded: only the reason that applies to this one. */
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
      client.invalidateQueries({ queryKey: ["order-tracking", orderId] }),
      client.invalidateQueries({ queryKey: ["parcels-in-transit"] }),
      // Cancelling a paid parcel sends its money back: the payment line and re-forward follow.
      client.invalidateQueries({ queryKey: ["reseller-supplier-payment"] }),
      // "Pedidos esperando você enviar" on the overview and the orders list.
      client.invalidateQueries({ queryKey: attentionCountsQueryOptions().queryKey }),
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
  const blocked = isShippingBlocked(detail.order.status);
  return (
    <div className="space-y-5">
      <MarketplaceTools detail={detail} onRefresh={refresh} />
      <SplitOrderNotice
        parcelCount={detail.shipments.length}
        marketplace={detail.order.marketplace}
      />
      {blocked ? (
        <p className="text-sm text-muted-foreground">
          {blockedOrderMessage(detail.order.status, detail.shipments.length > 0)}
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
const WRAPPING_BUTTON = "h-auto min-h-9 max-w-full py-2 text-balance whitespace-normal";

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
      toast.success("Rastreio atualizado");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    // The labels wrap inside the buttons: unwrapped, they are wider than a 375 px dialog and
    // pushed every field past its right edge.
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        className={WRAPPING_BUTTON}
        disabled={refresh.isPending}
        onClick={() => refresh.mutate()}
      >
        {refresh.isPending ? "Consultando…" : "Atualizar rastreio"}
      </Button>
      <LabelLink orderId={orderId} />
    </div>
  );
}

/** The order's marketplace label, opened in a new tab (a PDF, or an error page there). */
function LabelLink({ orderId }: { orderId: string }) {
  const withProfile = useTabProfileLink();
  return (
    <Button variant="outline" className={WRAPPING_BUTTON} asChild>
      <a
        href={withProfile(`/api/pedidos/${orderId}/etiqueta`)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Abrir etiqueta de postagem
      </a>
    </Button>
  );
}

function ShopeeLabelForm({ orderId }: { orderId: string }) {
  const withProfile = useTabProfileLink();
  return (
    <form
      method="post"
      action={withProfile(`/api/pedidos/${orderId}/etiqueta`)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <input type="hidden" name="solicitar" value="revenda" />
      <Button type="submit" variant="outline" className={WRAPPING_BUTTON}>
        Gerar etiqueta da Shopee
      </Button>
    </form>
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
    onSuccess: (_result, action) =>
      toast.success(
        action === "revoke"
          ? "Link desligado. O fornecedor não abre mais o pedido por ele."
          : "Link novo pronto. Mande ao fornecedor.",
      ),
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
              Desligar link
            </Button>
          </ShipmentActionHint>
        </div>
      )}
      {link?.url ? <CopySupplierLink url={link.url} emailed={link.emailed} /> : null}
    </div>
  );
}
/** A supplier with its own panel sees the parcel there: nothing to share with it. */
function PanelSupplierNote({ emailed }: { emailed: boolean }) {
  return (
    <p className="w-full text-xs text-muted-foreground">
      {emailed ? "Avisamos o fornecedor por e-mail. " : ""}O fornecedor vê este pedido no painel
      dele, sem link.
    </p>
  );
}

/** How the supplier reaches the parcel: its panel, or a link the reseller shares. */
function SupplierAccess({
  shipment,
  link,
  onLink,
}: {
  shipment: Detail["shipments"][number];
  link: SupplierLinkView | undefined;
  onLink: (url: string) => void;
}) {
  const closed = SETTLED_FULFILLMENT_STATUSES.includes(shipment.status);
  if (shipment.supplierHasPanel) {
    return closed ? null : <PanelSupplierNote emailed={link?.emailed === true} />;
  }
  return <SupplierLink shipmentId={shipment.id} link={link} closed={closed} onLink={onLink} />;
}

/** The one way forward for a parcel the supplier cancelled: send it again. */
function ReforwardButton({
  shipmentId,
  supplierHasPanel,
  onLink,
}: {
  shipmentId: string;
  supplierHasPanel: boolean;
  onLink: (url: string) => Promise<void>;
}) {
  // A paid parcel's money goes back to the reseller: the server refuses, so say why instead.
  const payment = useQuery(resellerSupplierPaymentQueryOptions(shipmentId));
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await reforwardShipmentFn({ data: { shipmentId } });
      await onLink(new URL(`/fornecedor/pedido/${result.token}`, window.location.origin).href);
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSuccess: () =>
      toast.success(
        supplierHasPanel
          ? "Envio reencaminhado. O fornecedor vê o pedido no painel."
          : "Envio reencaminhado. Compartilhe o novo link com o fornecedor.",
      ),
  });
  const block = payment.data?.reforwardBlock ?? null;
  if (block !== null) {
    return <p className="w-full text-sm">{REFORWARD_BLOCK_MESSAGES[block]}</p>;
  }
  return (
    <Button disabled={payment.isPending || mutation.isPending} onClick={() => mutation.mutate()}>
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
        Mande este link ao fornecedor para ele ver e atualizar o pedido. Vale por 30 dias. Se gerar
        outro, este para de funcionar.
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

  if (detail.order.marketplace === "shopee") {
    return <ShopeeLabelForm orderId={detail.order.id} />;
  }

  // TikTok Shop's tracking is not read yet; its label is.
  if (detail.order.marketplace === "tiktok_shop") {
    return (
      <div className="flex flex-wrap gap-2">
        <LabelLink orderId={detail.order.id} />
      </div>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      Anote a transportadora e o código de rastreio em cada envio. A etiqueta sai pela
      transportadora contratada.
    </p>
  );
}
