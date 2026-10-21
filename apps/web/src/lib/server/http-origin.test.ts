import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "./http";

const APP = "https://app.sellbridge.test";

function post(origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) {
    headers.set("origin", origin);
  }
  return new Request(`${APP}/api/suporte/chamados`, { method: "POST", headers });
}

describe("assertSameOrigin", () => {
  it("accepts the app's own pages and clients that send no origin", () => {
    expect(() => assertSameOrigin(post(APP), APP)).not.toThrow();
    expect(() => assertSameOrigin(post(null), APP)).not.toThrow();
  });

  it.each(["https://evil.sellbridge.test", "http://app.sellbridge.test", "null"])(
    "refuses a write sent from %s",
    (origin) => {
      expect(() => assertSameOrigin(post(origin), APP)).toThrow("Origem da solicitação");
    },
  );
});
