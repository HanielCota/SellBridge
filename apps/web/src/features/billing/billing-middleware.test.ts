import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://sellbridge.test" },
}));
import { assertBillingOrigin } from "./billing-middleware";
describe("billing write origin", () => {
  it("accepts the application origin", () => {
    expect(() =>
      assertBillingOrigin(
        new Headers({ origin: "https://sellbridge.test" }),
        "https://sellbridge.test/path",
      ),
    ).not.toThrow();
  });
  it.each([
    "https://attacker.test",
    "null",
    "http://sellbridge.test",
    "https://sellbridge.test.attacker.test",
  ])("rejects %s", (origin) => {
    expect(() => assertBillingOrigin(new Headers({ origin }), "https://sellbridge.test")).toThrow(
      "Origem da solicitação",
    );
  });
  it("rejects missing origin", () => {
    expect(() => assertBillingOrigin(new Headers(), "https://sellbridge.test")).toThrow(
      "Origem da solicitação",
    );
  });
});
