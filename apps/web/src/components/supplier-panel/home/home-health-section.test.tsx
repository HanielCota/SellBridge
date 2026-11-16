import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HEALTH_METRIC_DEFINITIONS,
  type HealthMetric,
  type SupplierHealth,
} from "@sellbridge/shared/supplier-panel-health";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/features/supplier-panel/home/team-notices.functions", () => ({
  getTeamNoticesFn: vi.fn<() => Promise<never>>(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
const { HomeHealthSection } = await import("./home-health-section");

function metric(overrides: Partial<HealthMetric> & Pick<HealthMetric, "key">): HealthMetric {
  return {
    definition: HEALTH_METRIC_DEFINITIONS[overrides.key],
    value: null,
    sample: 0,
    level: "insufficient",
    previousValue: null,
    trend: null,
    forecast: { kind: "steady" },
    ...overrides,
  };
}

function valueClassOf(markup: string, text: string): string {
  const match = new RegExp(`<p class="([^"]*)">${text}</p>`).exec(markup);
  if (match?.[1] === undefined) {
    throw new Error(`Value "${text}" not found in the strip`);
  }
  return match[1];
}

function strip(health: SupplierHealth): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <HomeHealthSection
          supplierId="supplier-1"
          health={health}
          performanceHref="/fornecedor/painel/desempenho"
          active
          highlighted={false}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("HomeHealthSection", () => {
  it("grays the values that do not count yet and keeps the measured ones dark", () => {
    const markup = strip({
      windowDays: 60,
      level: "green",
      metrics: [
        metric({ key: "accept_on_time" }),
        metric({ key: "average_rating", value: 4.5, sample: 12, level: "green" }),
      ],
    });

    expect(valueClassOf(markup, "0 pedidos")).toContain("text-muted-foreground");
    expect(valueClassOf(markup, "4,5")).not.toContain("text-muted-foreground");
  });
});
