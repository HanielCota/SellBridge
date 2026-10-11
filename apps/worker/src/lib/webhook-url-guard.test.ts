import { describe, expect, it } from "vitest";
import { assertDeliverableWebhookUrl, type ResolveHost } from "./webhook-url-guard.ts";

function resolvingTo(addresses: string[]): ResolveHost {
  return async () => addresses;
}

const guard = (url: string, addresses: string[], allowPrivate = false) =>
  assertDeliverableWebhookUrl(url, { allowPrivate, resolveHost: resolvingTo(addresses) });

describe("webhook URL guard", () => {
  it("accepts hosts that resolve only to public addresses", async () => {
    await expect(
      guard("https://hooks.example.com/x", ["93.184.216.34", "2606:2800:220:1::1"]),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["loopback", ["127.0.0.1"]],
    ["private network", ["10.0.0.5"]],
    ["cloud metadata", ["169.254.169.254"]],
    ["carrier NAT", ["100.64.1.1"]],
    ["IPv6 loopback", ["::1"]],
    ["IPv4-mapped IPv6", ["::ffff:192.168.0.1"]],
    ["one private among public", ["93.184.216.34", "192.168.0.10"]],
    ["no address", []],
  ])("refuses a host resolving to %s", async (_label, addresses) => {
    await expect(guard("https://hooks.example.com/x", addresses)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("strips IPv6 brackets before resolving", async () => {
    const seen: string[] = [];
    await expect(
      assertDeliverableWebhookUrl("http://[::1]:8080/", {
        allowPrivate: false,
        resolveHost: async (hostname) => {
          seen.push(hostname);
          return [hostname];
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(seen).toEqual(["::1"]);
  });

  it("refuses non-HTTP schemes even when private URLs are allowed", async () => {
    await expect(guard("file:///etc/passwd", [], true)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(guard("http://localhost:4000/hook", ["127.0.0.1"], true)).resolves.toBeUndefined();
  });
});
