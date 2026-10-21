import type { TicketCategory } from "@sellbridge/shared/schemas";
import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/**
 * "Falar com o suporte" for pages about a topic rather than one item (money, the plan): the
 * new-ticket form opens with that topic picked, like the order, store and listing shortcuts.
 */
export function TalkToSupportButton({ topic }: { topic: TicketCategory }) {
  return (
    <Button asChild variant="outline">
      <Link to="/suporte/novo" search={{ categoria: topic }}>
        <ChatCircleDotsIcon aria-hidden="true" />
        Falar com o suporte
      </Link>
    </Button>
  );
}
