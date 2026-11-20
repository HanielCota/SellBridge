import { describe, expect, it } from "vitest";
import { clientAddress } from "./client-address";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://internal/api/auth/sign-in/email", { method: "POST", headers });
}

describe("clientAddress", () => {
  it("reads the single address the proxy forwards", () => {
    const request = requestWith({ "x-forwarded-for": "203.0.113.7" });

    expect(clientAddress(request, "x-forwarded-for")).toBe("203.0.113.7");
  });

  it("reads the configured header instead of x-forwarded-for", () => {
    const request = requestWith({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1",
    });

    expect(clientAddress(request, "cf-connecting-ip")).toBe("203.0.113.7");
  });

  it("treats a header with several entries like a request with no address", () => {
    const padded = requestWith({ "x-forwarded-for": "198.51.100.9, 203.0.113.7" });
    const withoutHeader = requestWith({});

    expect(clientAddress(padded, "x-forwarded-for")).toBe(
      clientAddress(withoutHeader, "x-forwarded-for"),
    );
  });

  it("ignores a value that is not an address", () => {
    const request = requestWith({ "x-forwarded-for": "not-an-address" });

    expect(clientAddress(request, "x-forwarded-for")).toBe(
      clientAddress(requestWith({}), "x-forwarded-for"),
    );
  });
});
