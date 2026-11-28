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

/** The team-support pages already hold the ticket form and the threads. */
// The new-listing page has a publish bar along the bottom; the bubble covered its button there.
const LAUNCHER_HIDDEN_ON = ["/suporte", "/publicacoes/nova"];

/**
 * Conversations between stores and suppliers live under /suporte too, but they are not the
 * team's tickets: the bubble stays there, since the sidebar no longer has a way to the help card.
 */
const LAUNCHER_SHOWN_UNDER_SUPPORT = [
  "/suporte/revendedores",
  "/suporte/fornecedores",
  "/suporte/conversas",
];

/** Whether the corner support bubble stays out of the way on this page. */
export function isLauncherHidden(pathname: string): boolean {
  if (LAUNCHER_SHOWN_UNDER_SUPPORT.some((page) => isOnPage(pathname, page))) {
    return false;
  }
  return LAUNCHER_HIDDEN_ON.some((page) => isOnPage(pathname, page));
}
