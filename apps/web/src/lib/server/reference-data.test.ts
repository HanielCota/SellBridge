import { afterEach, describe, expect, it, vi } from "vitest";

const load = vi.hoisted(() =>
  vi.fn<(database: unknown) => Promise<{ id: string; name: string; slug: string }[]>>(
    async (_database) => [{ id: "category", name: "Category", slug: "category" }],
  ),
);
vi.mock("@sellbridge/database/repositories", () => ({ listAdminCategories: load }));
vi.mock("./database", () => ({ database: {} }));
import { loadProductCategories } from "./reference-data";

afterEach(() => vi.useRealTimers());

describe("product category reference cache", () => {
  it("shares reads across features and reloads the taxonomy after five minutes", async () => {
    vi.useFakeTimers();
    const categories = await Promise.all(Array.from({ length: 20 }, () => loadProductCategories()));
    expect(load).toHaveBeenCalledTimes(1);
    expect(categories.every((value) => value[0]?.id === "category")).toBe(true);
    vi.advanceTimersByTime(5 * 60_000);
    await loadProductCategories();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
