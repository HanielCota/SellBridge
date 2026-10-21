import type { NewTicketSearch } from "@sellbridge/shared/schemas";
import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/**
 * "Falar com o suporte": opens the new-ticket form already about what the page shows, a topic
 * (money, the plan) or one item (`supportTicketSearch` for an order).
 */
export function TalkToSupportButton({ search }: { search: NewTicketSearch }) {
  return (
    <Button asChild variant="outline">
      <Link to="/suporte/novo" search={search}>
        <ChatCircleDotsIcon aria-hidden="true" />
        Falar com o suporte
      </Link>
    </Button>
  );
}
