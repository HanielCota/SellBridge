import { describe, expect, it, vi } from "vitest";

/** Records which middlewares each server function was built with. */
const built = vi.hoisted(() => ({ middlewares: [] as unknown[][] }));

vi.mock("@/lib/server/middleware", () => ({
  staffMiddleware: (permission: string) => ({ staffPermission: permission }),
}));
vi.mock("./supplier-flags.server", () => ({}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: (middlewares: unknown[]) => {
        built.middlewares.push(middlewares);
        return builder;
      },
      validator: () => builder,
      handler: () => builder,
    };
    return builder;
  },
}));

await import("./supplier-flags.functions");

describe("supplier flags server functions", () => {
  it("open the list to every team member and keep apply and revoke for suppliers.flag", () => {
    expect(built.middlewares).toEqual([
      [{ staffPermission: "suppliers.view_flags" }],
      [{ staffPermission: "suppliers.flag" }],
      [{ staffPermission: "suppliers.flag" }],
    ]);
  });
});
