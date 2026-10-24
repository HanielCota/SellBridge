import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FilterTabs } from "@/components/data/filter-tabs";
import { myUnreadConversationsQueryOptions } from "@/features/supplier-support/supplier-support.queries";

export type SupportArea = "platform" | "conversations";

/** A store talks to its suppliers; a supplier hears from the stores that sell it. */
export function conversationsLabel(kind: ProfileKind): string {
  return kind === "seller" ? "Fornecedores" : "Revendedores";
}

export function conversationsPath(kind: ProfileKind) {
  return kind === "seller"
    ? ("/suporte/fornecedores" as const)
    : ("/suporte/revendedores" as const);
}

/**
 * The two inboxes of Suporte side by side: the tickets with the SellBridge team, and the
 * conversations between store and supplier. The count is what the other side wrote unread.
 */
export function SupportAreaTabs({ current, kind }: { current: SupportArea; kind: ProfileKind }) {
  const navigate = useNavigate();
  const unread = useQuery(myUnreadConversationsQueryOptions());
  const unreadCount = unread.data === undefined || unread.data === 0 ? undefined : unread.data;
  return (
    <FilterTabs
      legend="Com quem é a conversa"
      value={current}
      tabs={[
        { value: "platform", label: "SellBridge" },
        { value: "conversations", label: conversationsLabel(kind), count: unreadCount },
      ]}
      onChange={(area) =>
        void navigate({ to: area === "platform" ? "/suporte" : conversationsPath(kind) })
      }
    />
  );
}
