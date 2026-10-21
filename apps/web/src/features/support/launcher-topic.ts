import type { TicketCategory } from "@sellbridge/shared/schemas";

/** Pages where the question is almost always about money: the form opens on that topic. */
const MONEY_PAGES = ["/financeiro", "/assinatura"];

function isOnPage(pathname: string, page: string): boolean {
  return pathname === page || pathname.startsWith(`${page}/`);
}

/**
 * The topic the corner bubble picks for the page the customer is on, or undefined to start the
 * form at step 1. It replaced a "Falar com o suporte" button at the top of those pages, which
 * put a third support button on screen.
 */
export function launcherTopic(pathname: string): TicketCategory | undefined {
  return MONEY_PAGES.some((page) => isOnPage(pathname, page)) ? "payment" : undefined;
}
