import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { ResolveHost } from "./client.ts";
import { NonPublicImageAddressError, publicOnlyLookup } from "./image-download.ts";

const HOST = "imagens.exemplo.com.br";

/** The lookup as the socket calls it, with the address it hands over. */
function lookupWith(resolveHost: ResolveHost, all = false): Promise<unknown> {
  const lookup = promisify(publicOnlyLookup(resolveHost));
  return lookup(HOST, { all });
}

describe("publicOnlyLookup", () => {
  it("connects to the public address the host resolves to", async () => {
    const address = await lookupWith(async () => ["93.184.216.34"]);

    expect(address).toBe("93.184.216.34");
  });

  it("refuses at connection time a host that now resolves to a private address", async () => {
    // DNS rebinding: the earlier URL check saw a public address, the connection gets 127.0.0.1.
    const answers = [["93.184.216.34"], ["127.0.0.1"]];
    const resolveHost: ResolveHost = async () => answers.shift() ?? [];
    await resolveHost(HOST);

    await expect(lookupWith(resolveHost)).rejects.toBeInstanceOf(NonPublicImageAddressError);
  });

  it("refuses a host with any non-public address among its answers", async () => {
    const lookup = lookupWith(async () => ["93.184.216.34", "10.0.0.5"], true);

    await expect(lookup).rejects.toBeInstanceOf(NonPublicImageAddressError);
  });

  it("refuses a host that resolves to nothing", async () => {
    await expect(lookupWith(async () => [])).rejects.toBeInstanceOf(NonPublicImageAddressError);
  });
});
