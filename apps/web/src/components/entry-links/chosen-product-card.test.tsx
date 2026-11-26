import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/environment", () => ({ environment: {} }));
// The fee schedule is fetched from the server; the shared default stands in for it.
vi.mock("@/features/reports/fee-schedule.queries", async () => {
  const { DEFAULT_FEE_SCHEDULE } = await import("@sellbridge/shared/fee-model");
  return { useFeeSchedule: () => DEFAULT_FEE_SCHEDULE };
});

const { ChosenProductCard } = await import("./chosen-product-card");

const PRODUCT: SellableCatalogProduct = {
  id: "p1",
  sku: "SKU-1",
  title: "Blusa de tricô",
  description: "Tricô canelado",
  costCents: 3_387,
  weightGrams: 300,
  suggestedPriceCents: 7_790,
  stock: 3,
  stockUpdatedAt: new Date("2026-11-01T12:00:00Z"),
  imageUrl: null,
  imageUrls: [],
  categoryName: null,
  categorySlug: null,
  supplierId: "supplier-1",
  supplierName: "Fornecedor",
  published: false,
};

function render(): string {
  return renderToStaticMarkup(
    <ChosenProductCard
      product={PRODUCT}
      channels={["mercado_livre"]}
      ticked
      tickDisabled={false}
      onTickedChange={() => undefined}
    />,
  );
}

describe("ChosenProductCard", () => {
  it("keeps the checkbox outside its label so one click toggles it once", () => {
    const markup = render();

    const label = /<label[^>]*for="([^"]+)"[\s\S]*?<\/label>/.exec(markup);
    expect(label).not.toBeNull();
    expect(label?.[0]).not.toContain('role="checkbox"');
    expect(markup).toContain(`id="${label?.[1]}"`);
  });
});
