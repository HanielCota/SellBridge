import type { LinkedOrder } from "@sellbridge/database/repositories";
import { PackageIcon } from "@phosphor-icons/react";
import { OrderPickerPopover } from "@/components/support/order-link-picker";
import { Button } from "@/components/ui/button";

/**
 * "Qual pedido?" on an order topic, before sending: the team gets the ticket with the order
 * already pinned instead of asking for it afterwards. Optional, since some questions are about
 * no order in particular.
 */
export function OrderStep({
  order,
  onPick,
  onClear,
}: {
  order: LinkedOrder | null;
  onPick: (order: LinkedOrder) => void;
  onClear: () => void;
}) {
  return (
    <section aria-labelledby="new-ticket-order" className="space-y-2">
      <div>
        <h2 id="new-ticket-order" className="text-sm font-semibold">
          Qual pedido? <span className="font-normal text-muted-foreground">(opcional)</span>
        </h2>
        <p className="text-sm text-muted-foreground">Com ele o suporte responde mais rápido.</p>
      </div>
      {order === null ? (
        <OrderPickerPopover
          ticketId={undefined}
          onPick={(picked) => {
            onPick(picked);
            return true;
          }}
          trigger={
            <Button type="button" variant="outline" className="min-h-11">
              <PackageIcon aria-hidden="true" />
              Escolher pedido
            </Button>
          }
        />
      ) : (
        <PickedOrder order={order} onPick={onPick} onClear={onClear} />
      )}
    </section>
  );
}

function PickedOrder({
  order,
  onPick,
  onClear,
}: {
  order: LinkedOrder;
  onPick: (order: LinkedOrder) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/50 p-3">
      <p className="min-w-0 text-sm">
        <span className="block font-medium">Pedido #{order.externalOrderId}</span>
        <span className="block truncate text-muted-foreground">
          {order.storeName} · {order.buyerName ?? "Comprador"}
        </span>
      </p>
      <div className="flex gap-1">
        <OrderPickerPopover
          ticketId={undefined}
          align="end"
          onPick={(picked) => {
            onPick(picked);
            return true;
          }}
          trigger={
            <Button type="button" variant="ghost" className="min-h-11">
              Trocar pedido
            </Button>
          }
        />
        <Button type="button" variant="ghost" className="min-h-11" onClick={onClear}>
          Tirar pedido
        </Button>
      </div>
    </div>
  );
}
