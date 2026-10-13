import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deliveryAddressSchema,
  type DeliveryAddress,
  SETTLED_FULFILLMENT_STATUSES,
} from "@sellbridge/shared/schemas";
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
  revokeSupplierLinkFn,
  rotateSupplierLinkFn,
  updateShipmentFn,
} from "@/features/fulfillment/fulfillment.functions";
import {
  getMarketplaceShippingFn,
  refreshMarketplaceTrackingFn,
} from "@/features/fulfillment/marketplace.functions";
import { errorMessage } from "@/lib/errors";
import { Field, ShipmentPanel } from "./shipment-panel";

type Detail = Awaited<
  ReturnType<typeof import("@/features/fulfillment/fulfillment.functions").getFulfillmentFn>
>;
export function FulfillmentDialog({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(orderId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Operar pedido</DialogTitle>
          <DialogDescription>
            Encaminhe ao fornecedor e acompanhe cada volume até a entrega.
          </DialogDescription>
        </DialogHeader>
        {orderId ? <OrderContent key={orderId} orderId={orderId} /> : null}
      </DialogContent>
    </Dialog>
  );
}
function OrderContent({ orderId }: { orderId: string }) {
  const query = useQuery(fulfillmentQueryOptions(orderId));
  const client = useQueryClient();
  const [links, setLinks] = useState<Record<string, string>>({});
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["fulfillment", orderId] }),
      client.invalidateQueries({ queryKey: ["operations"] }),
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
      <p className="font-medium">Pedido {detail.order.externalOrderId}</p>
      <MarketplaceTools detail={detail} onRefresh={refresh} />
      {blocked ? (
        <p className="text-sm text-destructive">
          Pedido sem liberação para envio: pagamento pendente, cancelamento ou devolução.
        </p>
      ) : null}
      {detail.shipments.length === 0 ? (
        <ForwardForm detail={detail} onForwarded={onForwarded} />
      ) : (
        detail.shipments.map((shipment) => (
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
            <SupplierLink
              shipmentId={shipment.id}
              url={links[shipment.id]}
              closed={SETTLED_FULFILLMENT_STATUSES.includes(shipment.status)}
              onLink={(url) => setLinks((previous) => ({ ...previous, [shipment.id]: url }))}
            />
          </ShipmentPanel>
        ))
      )}
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
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
        Atualizar rastreio do marketplace
      </Button>
      <Button variant="outline" asChild>
        <a href={`/api/pedidos/${orderId}/etiqueta`} target="_blank" rel="noopener noreferrer">
          Gerar etiqueta de postagem do marketplace
        </a>
      </Button>
    </div>
  );
}
function SupplierLink({
  shipmentId,
  url,
  closed,
  onLink,
}: {
  shipmentId: string;
  url: string | undefined;
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
  return (
    <div className="w-full space-y-2">
      {closed ? null : (
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate("create")}
          >
            Gerar novo link para fornecedor
          </Button>
          <Button
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate("revoke")}
          >
            Revogar acesso
          </Button>
        </div>
      )}
      {url ? <CopySupplierLink url={url} /> : null}
    </div>
  );
}
const ADDRESS_KEYS = [
  "recipient",
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "postalCode",
] as const;
const ADDRESS_LABELS: Record<keyof DeliveryAddress, string> = {
  recipient: "Destinatário",
  street: "Rua",
  number: "Número",
  complement: "Complemento",
  neighborhood: "Bairro",
  city: "Cidade",
  state: "UF",
  postalCode: "CEP",
};
function ForwardForm({
  detail,
  onForwarded,
}: {
  detail: Detail;
  onForwarded: (links: Awaited<ReturnType<typeof forwardOrderFn>>) => Promise<void>;
}) {
  const { address, setAddress, notes, setNotes, loadAddress, forward } = useForwardForm(
    detail,
    onForwarded,
  );
  const unmapped = !detail.items.length || detail.items.some((item) => !item.supplierId);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        forward.mutate();
      }}
    >
      <ForwardItems detail={detail} />
      {detail.order.marketplace === "mercado_livre" ? (
        <Button
          variant="outline"
          type="button"
          disabled={loadAddress.isPending}
          onClick={() => loadAddress.mutate()}
        >
          Importar endereço do marketplace
        </Button>
      ) : null}
      <AddressFields
        address={address}
        onChange={(key, value) => setAddress((previous) => ({ ...previous, [key]: value }))}
      />
      <Field label="Instruções para o fornecedor" value={notes} onChange={setNotes} />
      {unmapped ? (
        <p className="text-sm text-destructive">
          Todos os itens precisam estar vinculados a fornecedores antes do encaminhamento.
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={forward.isPending || unmapped || detail.order.status !== "paid"}
      >
        {forward.isPending ? "Encaminhando…" : "Criar ordens e encaminhar aos fornecedores"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Cada fornecedor recebe uma ordem com seus próprios itens. Após criar, compartilhe o link de
        acesso exibido em cada envio.
      </p>
    </form>
  );
}

function CopySupplierLink({ url }: { url: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Compartilhe este link com o fornecedor para ele receber e atualizar o pedido. Válido por 30
        dias. Um novo link revoga o anterior.
      </p>
      <Input aria-label="Link do fornecedor" readOnly value={url} />
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

function useForwardForm(
  detail: Detail,
  onForwarded: (links: Awaited<ReturnType<typeof forwardOrderFn>>) => Promise<void>,
) {
  const [address, setAddress] = useState<DeliveryAddress>({
    recipient: detail.order.buyerName ?? "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    postalCode: "",
  });
  const [notes, setNotes] = useState("");
  const loadAddress = useMutation({
    mutationFn: () => getMarketplaceShippingFn({ data: { orderId: detail.order.id } }),
    onSuccess: (result) => {
      if (result.address) {
        setAddress(result.address);
        return;
      }
      toast.error("O marketplace não informou o endereço completo");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const forward = useMutation({
    mutationFn: async () => {
      const parsed = deliveryAddressSchema.safeParse(address);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Confira o endereço");
      return forwardOrderFn({ data: { orderId: detail.order.id, address: parsed.data, notes } });
    },
    onSuccess: onForwarded,
    onError: (error) => toast.error(errorMessage(error)),
  });
  return { address, setAddress, notes, setNotes, loadAddress, forward };
}

function ForwardItems({ detail }: { detail: Detail }) {
  return (
    <ul className="space-y-2 text-sm">
      {detail.items.map((item) => (
        <li key={item.id}>
          {item.quantity} × {item.title} ·{" "}
          <span className={item.supplierId ? "text-muted-foreground" : "text-destructive"}>
            {item.supplierName ?? "Sem fornecedor vinculado"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function supplierLinks(result: Awaited<ReturnType<typeof forwardOrderFn>>) {
  return Object.fromEntries(
    result.map((link) => [
      link.shipmentId,
      new URL(`/fornecedor/pedido/${link.token}`, window.location.origin).href,
    ]),
  );
}

function AddressFields({
  address,
  onChange,
}: {
  address: DeliveryAddress;
  onChange: (key: keyof DeliveryAddress, value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ADDRESS_KEYS.map((key) => (
        <Field
          key={key}
          label={ADDRESS_LABELS[key]}
          value={address[key]}
          onChange={(value) => onChange(key, key === "state" ? value.toUpperCase() : value)}
        />
      ))}
    </div>
  );
}

function MarketplaceTools({
  detail,
  onRefresh,
}: {
  detail: Detail;
  onRefresh: () => Promise<void>;
}) {
  return (
    <>
      {" "}
      {detail.order.marketplace === "mercado_livre" ? (
        <MarketplaceActions orderId={detail.order.id} onRefresh={onRefresh} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Registre transportadora e rastreio em cada envio. A etiqueta de postagem é emitida pela
          transportadora contratada.
        </p>
      )}
    </>
  );
}
