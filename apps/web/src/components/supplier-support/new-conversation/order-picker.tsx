import type { ConversationOrder } from "@sellbridge/database/repositories";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { myConversationOrdersQueryOptions } from "@/features/supplier-support/supplier-support.queries";

/** Radix Select has no empty value: this stands for "no order". */
const NO_ORDER = "none";
const PICKER_ID = "conversation-order";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * The order the conversation is about, from the store's latest orders. Optional: a question
 * about a product has none. Suggested on order topics, where the supplier looks the case up.
 */
export function OrderPicker({
  storeConnectionId,
  value,
  suggested,
  prefilled,
  onChange,
}: {
  storeConnectionId: string;
  value: string | undefined;
  suggested: boolean;
  /** The order the form was opened from: listed even when older than the latest ones. */
  prefilled: ConversationOrder | null;
  onChange: (orderId: string | undefined) => void;
}) {
  const query = useQuery(myConversationOrdersQueryOptions(storeConnectionId, ""));
  const latest = query.data ?? [];
  const missesPrefilled =
    prefilled !== null && !latest.some((order) => order.orderId === prefilled.orderId);
  const orders = missesPrefilled ? [prefilled, ...latest] : latest;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={PICKER_ID}>Qual pedido? {suggested ? null : "(se tiver)"}</Label>
      <Select
        value={value ?? NO_ORDER}
        onValueChange={(next) => onChange(next === NO_ORDER ? undefined : next)}
      >
        <SelectTrigger id={PICKER_ID} className="w-full">
          <SelectValue placeholder="Nenhum pedido" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_ORDER}>Nenhum pedido</SelectItem>
          {orders.map((order) => (
            <SelectItem key={order.orderId} value={order.orderId}>
              Pedido #{order.externalOrderId} · {dateFormatter.format(order.orderedAt)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {suggested ? (
        <p className="text-sm text-muted-foreground">
          Com o pedido, o fornecedor encontra o caso mais rápido.
        </p>
      ) : null}
    </div>
  );
}
