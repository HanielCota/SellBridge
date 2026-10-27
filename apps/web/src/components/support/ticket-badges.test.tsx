import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResponseDeadlineBadge, TicketPriorityBadge } from "./ticket-badges";

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
}

const HOUR = 60 * 60_000;

describe("ticket badges", () => {
  it("keeps the priority legend reachable by keyboard on its own", () => {
    expect(render(<TicketPriorityBadge priority="high" />)).toContain('tabindex="0"');
  });

  it("adds no focus stop of its own inside a linked row", () => {
    const markup = render(
      <a href="/admin/chamados/1">
        <TicketPriorityBadge priority="high" focusable={false} />
        <ResponseDeadlineBadge
          status="open"
          priority="high"
          awaitingSince={new Date(Date.now() - 30 * HOUR)}
          focusable={false}
        />
      </a>,
    );
    expect(markup).toContain("Alta");
    expect(markup).toContain("Atrasado");
    expect(markup).not.toContain("tabindex");
  });
});
