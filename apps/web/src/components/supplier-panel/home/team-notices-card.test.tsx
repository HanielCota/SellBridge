import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SupplierHomeTeamNotice } from "@/features/supplier-panel/home/home-types";
import { teamNoticesQueryOptions } from "@/features/supplier-panel/home/team-notices.queries";

vi.mock("@/features/supplier-panel/home/team-notices.functions", () => ({
  getTeamNoticesFn: vi.fn<() => Promise<never>>(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
const { TeamNoticesCard } = await import("./team-notices-card");

const supplierId = "b90fe97c-fd21-4ce8-ab70-908f233c7038";
const notice: SupplierHomeTeamNotice = {
  id: "1b6f3a8e-2c4d-4e5f-8a9b-0c1d2e3f4a5b",
  reason: "order_error",
  note: "Cor trocada no pedido 1234",
  createdAt: new Date("2026-10-12T15:00:00Z"),
  expiresAt: new Date("2027-01-10T15:00:00Z"),
};

function render(client: QueryClient, active = true): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <TeamNoticesCard supplierId={supplierId} active={active} highlighted={false} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function clientWith(notices: readonly SupplierHomeTeamNotice[]): QueryClient {
  const client = new QueryClient();
  client.setQueryData(teamNoticesQueryOptions(supplierId).queryKey, [...notices]);
  return client;
}

/** A fetch that already failed after its retries, as the home shows it until the next refetch. */
function clientWithFailedNotices(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  const options = teamNoticesQueryOptions(supplierId);
  client
    .getQueryCache()
    .build(client, options)
    .setState({ status: "error", error: new Error("network down"), fetchStatus: "idle" });
  return client;
}

describe("TeamNoticesCard", () => {
  it("shows the green card only once the supplier's flags loaded empty", () => {
    expect(render(clientWith([]))).toContain("Nenhuma flag: sua conta está em dia");
  });

  it("shows nothing while the flags load or when they fail to load", () => {
    expect(render(new QueryClient())).toBe("");
    expect(render(clientWithFailedNotices())).toBe("");
  });

  it("lists each flag with its own contest link and the count", () => {
    const markup = render(clientWith([notice]));
    expect(markup).toContain("Erro em pedido");
    expect(markup).toContain("Contestar esta flag");
    expect(markup).toContain("1 de 3 em 90 dias");
    expect(markup).not.toContain("Nenhuma flag");
  });

  it("says the account is off for a switched-off supplier", () => {
    expect(render(clientWith([notice]), false)).toContain("A conta está desligada.");
  });
});
