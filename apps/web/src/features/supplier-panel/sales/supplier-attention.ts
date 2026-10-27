import type { SupplierAttentionTarget } from "@sellbridge/shared/supplier-panel-attention";
import type { CatalogFix } from "@sellbridge/shared/supplier-panel-home-queue";
import { STOCK_RUNNING_OUT_DAYS } from "@sellbridge/shared/supplier-panel-sales";
import { ClockCountdownIcon, PackageIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { ListingAlertIcon, SupportHeadsetIcon } from "@/components/reports/attention-icons";
import type { AttentionRow } from "@/components/reports/attention-panel";

/** What the supplier's "Precisa de você" reads, gathered from the home and the sales. */
export interface SupplierAttentionInput {
  ordersToAccept: number;
  /** The first parcel's countdown ("Aceite em 3 h"), and whether it is already late. */
  firstAccept: { label: string; overdue: boolean } | null;
  runningOut: { count: number; productId: string | null };
  catalog: readonly CatalogFix[];
  unreadSupportReplies: number;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

type HrefFor = (target: SupplierAttentionTarget) => string;

function acceptItems(input: SupplierAttentionInput, hrefFor: HrefFor): AttentionRow[] {
  if (input.ordersToAccept === 0) {
    return [];
  }
  const late = input.firstAccept?.overdue === true;
  return [
    {
      key: "accept",
      icon: ClockCountdownIcon,
      tone: late ? "danger" : "review",
      title: plural(input.ordersToAccept, "pedido para aceitar", "pedidos para aceitar"),
      description:
        input.firstAccept === null
          ? "Aceite para o revendedor saber que você vai enviar."
          : `${input.firstAccept.label}: ${late ? "o revendedor está esperando." : "o primeiro vence antes."}`,
      href: hrefFor({ area: "orders", filter: late ? "accept_overdue" : "accept_soon" }),
    },
  ];
}

function stockItems(input: SupplierAttentionInput, hrefFor: HrefFor): AttentionRow[] {
  const soldOut = input.catalog.filter((fix) => fix.kind === "out_of_stock");
  const items: AttentionRow[] = [];
  if (soldOut.length > 0) {
    const [first] = soldOut;
    items.push({
      key: "sold-out",
      icon: ListingAlertIcon,
      tone: "danger",
      title: plural(soldOut.length, "produto sem estoque à venda", "produtos sem estoque à venda"),
      description: "Os anúncios seguem recebendo pedidos que você não consegue enviar.",
      href: hrefFor({
        area: "stock",
        filter: "out_of_stock_listed",
        ...(soldOut.length === 1 && first !== undefined ? { productId: first.productId } : {}),
      }),
    });
  }
  if (input.runningOut.count > 0) {
    const productId = input.runningOut.count === 1 ? input.runningOut.productId : null;
    items.push({
      key: "running-out",
      icon: PackageIcon,
      tone: "review",
      title: plural(input.runningOut.count, "produto acabando", "produtos acabando"),
      description: `No ritmo dos últimos 30 dias, o estoque dura até ${STOCK_RUNNING_OUT_DAYS} dias.`,
      href: hrefFor({
        area: "stock",
        filter: "out_of_stock_listed",
        ...(productId === null ? {} : { productId }),
      }),
    });
  }
  return items;
}

function catalogItems(input: SupplierAttentionInput, hrefFor: HrefFor): AttentionRow[] {
  const rejected = input.catalog.filter((fix) => fix.kind === "rejected");
  const [first] = rejected;
  if (first === undefined) {
    return [];
  }
  const one = rejected.length === 1;
  return [
    {
      key: "rejected",
      icon: PencilSimpleIcon,
      tone: "review",
      title: plural(rejected.length, "produto para corrigir", "produtos para corrigir"),
      description: one ? first.reason : "A equipe pediu ajustes; abra para ver o motivo.",
      href: hrefFor({
        area: "catalog",
        filter: "rejected",
        ...(one ? { productId: first.productId } : {}),
        ...(one && first.field !== null ? { field: first.field } : {}),
      }),
    },
  ];
}

/**
 * The supplier's "Precisa de você", most urgent first: orders to accept, then stock (sold out,
 * then running out), then products to fix, then a support reply.
 */
export function buildSupplierAttention(
  input: SupplierAttentionInput,
  hrefFor: HrefFor,
  supportHref: string,
): AttentionRow[] {
  const support: AttentionRow[] =
    input.unreadSupportReplies > 0
      ? [
          {
            key: "support",
            icon: SupportHeadsetIcon,
            tone: "info",
            title: "Suporte respondeu",
            description:
              input.unreadSupportReplies === 1
                ? "A equipe respondeu seu chamado."
                : "A equipe respondeu seus chamados.",
            href: supportHref,
          },
        ]
      : [];
  return [
    ...acceptItems(input, hrefFor),
    ...stockItems(input, hrefFor),
    ...catalogItems(input, hrefFor),
    ...support,
  ];
}
