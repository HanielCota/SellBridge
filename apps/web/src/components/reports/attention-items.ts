import type { LinkProps } from "@tanstack/react-router";
import type { ComponentType } from "react";
import {
  ListingAlertIcon,
  PaymentCardAlertIcon,
  ReviewBubbleIcon,
  StorePausedIcon,
  SupportHeadsetIcon,
} from "@/components/reports/attention-icons";
import { billingNoticeCopy, type BillingNoticeView } from "@/features/billing/billing-notice";

/** What the "Precisa de você" panel lists; kept free of server code so it can be tested alone. */
export interface AttentionItem {
  key: string;
  icon: ComponentType<{ className?: string }>;
  tone: "danger" | "info" | "review";
  title: string;
  description: string;
  to: NonNullable<LinkProps["to"]>;
  /** Opens the page on the right tab or filter: the reviews item lands on the pending reviews. */
  search?: { view: "reviews"; review: "pending" };
}

export interface StoreState {
  id: string;
  name: string;
  status: string;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export interface AttentionCounts {
  failedListings: number;
  unreadSupportReplies: number;
  pendingReviews: number;
}

/** A plan payment to fix (item 16, N9): right after the stores, it can cost the plan's limits. */
function billingItems(notice: BillingNoticeView | null | undefined): AttentionItem[] {
  if (notice === null || notice === undefined) {
    return [];
  }
  return [
    {
      key: "billing",
      icon: PaymentCardAlertIcon,
      tone: "danger",
      ...billingNoticeCopy(notice),
      to: "/assinatura",
    },
  ];
}

export function buildAttentionItems(
  counts: AttentionCounts,
  stores: readonly StoreState[],
  notice: BillingNoticeView | null | undefined,
): AttentionItem[] {
  const { failedListings, unreadSupportReplies, pendingReviews } = counts;
  const storeItems: AttentionItem[] = stores
    .filter((store) => store.status === "expired" || store.status === "error")
    .map((store) => ({
      key: `store-${store.id}`,
      icon: StorePausedIcon,
      tone: "danger",
      title: `Reconecte ${store.name}`,
      description: "O acesso expirou: pedidos e estoque estão parados nesta loja.",
      to: "/lojas",
    }));
  const items = [...storeItems, ...billingItems(notice)];
  if (failedListings > 0) {
    items.push({
      key: "listings",
      icon: ListingAlertIcon,
      tone: "danger",
      title: plural(failedListings, "publicação com erro", "publicações com erro"),
      description: "Veja o motivo e reprocesse.",
      to: "/publicacoes",
    });
  }
  if (unreadSupportReplies > 0) {
    items.push({
      key: "tickets",
      icon: SupportHeadsetIcon,
      tone: "info",
      title: plural(
        unreadSupportReplies,
        "chamado com resposta nova",
        "chamados com resposta nova",
      ),
      description:
        unreadSupportReplies === 1
          ? "A equipe respondeu seu chamado."
          : "A equipe respondeu seus chamados.",
      to: "/suporte",
    });
  }
  // Last: it builds the supplier scores but never blocks a sale.
  if (pendingReviews > 0) {
    items.push({
      key: "reviews",
      icon: ReviewBubbleIcon,
      tone: "review",
      title: plural(pendingReviews, "pedido para avaliar", "pedidos para avaliar"),
      description: "Conte como o fornecedor se saiu e ajude a formar o score.",
      to: "/pedidos",
      search: { view: "reviews", review: "pending" },
    });
  }
  return items;
}
