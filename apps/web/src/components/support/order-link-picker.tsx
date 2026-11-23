import type { LinkedOrder } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/data/search-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { linkMyTicketOrder } from "@/features/support/support.functions";
import { myLinkableOrdersQueryOptions } from "@/features/support/support.queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/errors";

const SEARCH_DELAY_MILLISECONDS = 250;
const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function OrderOption({ order, onPick }: { order: LinkedOrder; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        onClick={onPick}
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">#{order.externalOrderId}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {order.storeName} · {order.buyerName ?? "Comprador"}
          </span>
        </span>
        <span className="shrink-0 text-right text-xs text-muted-foreground">
          <span className="block text-foreground tabular-nums">
            {formatCents(order.totalCents)}
          </span>
          {shortDate.format(order.orderedAt)}
        </span>
      </button>
    </li>
  );
}

function OrderOptions({
  ticketId,
  query,
  onPick,
}: {
  ticketId: string | undefined;
  query: string;
  onPick: (order: LinkedOrder) => void;
}) {
  const orders = useQuery(myLinkableOrdersQueryOptions(ticketId, query));
  if (orders.isPending) {
    return (
      <output className="block space-y-1.5 p-1" aria-label="Carregando pedidos">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-10 rounded-xl" />
      </output>
    );
  }
  if (orders.isError) {
    return <p className="p-2 text-sm text-destructive">{errorMessage(orders.error)}</p>;
  }
  if (orders.data.length === 0) {
    return (
      <p className="p-2 text-sm text-muted-foreground">
        {query ? "Nenhum pedido com esse número ou comprador." : "Sua loja ainda não tem pedidos."}
      </p>
    );
  }
  return (
    <ul className="max-h-72 space-y-0.5 overflow-y-auto" aria-label="Seus pedidos recentes">
      {orders.data.map((order) => (
        <OrderOption key={order.orderId} order={order} onPick={() => onPick(order)} />
      ))}
    </ul>
  );
}

function useLinkOrder(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: LinkedOrder) =>
      linkMyTicketOrder({ data: { ticketId, orderId: order.orderId } }),
    onSuccess: async (_result, order) => {
      toast.success(`Pedido #${order.externalOrderId} vinculado`);
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/**
 * Popover listing the store's orders, searched by number or buyer. Without a ticket (the
 * new-ticket form) it lists every order; with one, the orders that ticket does not have yet.
 */
export function OrderPickerPopover({
  ticketId,
  trigger,
  align = "start",
  onPick,
}: {
  ticketId: string | undefined;
  trigger: ReactNode;
  align?: "start" | "end";
  /** Returns true when the popover can close (the pick went through). */
  onPick: (order: LinkedOrder) => boolean | Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim(), SEARCH_DELAY_MILLISECONDS);

  async function pick(order: LinkedOrder) {
    if (await onPick(order)) {
      setOpen(false);
      setSearch("");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-2" align={align}>
        <p className="flex items-center gap-1.5 px-1 pt-1 text-xs text-muted-foreground">
          <PackageIcon aria-hidden="true" />
          Escolha o pedido de que você está falando
        </p>
        <SearchInput
          label="Buscar pedido"
          placeholder="Número do pedido ou comprador"
          maxLength={100}
          value={search}
          onValueChange={setSearch}
        />
        {open ? (
          <OrderOptions ticketId={ticketId} query={query} onPick={(order) => void pick(order)} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** Popover to pin one of the store's orders to an open ticket. */
export function OrderLinkPicker({
  ticketId,
  trigger,
  align = "start",
}: {
  ticketId: string;
  trigger: ReactNode;
  align?: "start" | "end";
}) {
  const link = useLinkOrder(ticketId);
  return (
    <OrderPickerPopover
      ticketId={ticketId}
      trigger={trigger}
      align={align}
      onPick={async (order) => {
        if (link.isPending) {
          return false;
        }
        try {
          await link.mutateAsync(order);
          return true;
        } catch {
          // useLinkOrder already showed the error; the popover stays open to pick again.
          return false;
        }
      }}
    />
  );
}
