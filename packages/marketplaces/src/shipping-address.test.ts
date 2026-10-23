import { randomBytes } from "node:crypto";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { describe, expect, it } from "vitest";
import { decodeMockOrderResource, encodeMockOrderResource } from "./mock/codec.ts";
import { createUnavailableConnector } from "./unavailable-connector.ts";
import { openShippingAddress, sealShippingAddress } from "./shipping-address-seal.ts";
import { shippingAddressReading } from "./shipping-address.ts";

const address = {
  recipient: "Ana Souza",
  street: "Rua das Palmeiras",
  number: "120",
  complement: "Apto 32",
  neighborhood: "Jardim América",
  city: "Campinas",
  state: "SP",
  postalCode: "13010-000",
};
const cipher = createTokenCipher(randomBytes(32).toString("base64"));
const store = { externalShopId: "1", accessToken: "token" };

describe("marketplace shipping address", () => {
  it("accepts a full address and fills the optional fields", () => {
    const { complement: _complement, neighborhood: _neighborhood, ...required } = address;
    expect(shippingAddressReading({ ...required, state: " sp " })).toEqual({
      kind: "available",
      address: { ...required, state: "SP", complement: "", neighborhood: "" },
    });
  });
  it("reads a missing or malformed address as not provided", () => {
    expect(shippingAddressReading(null)).toEqual({ kind: "unavailable", reason: "not_provided" });
    expect(shippingAddressReading({ ...address, postalCode: "123" })).toEqual({
      kind: "unavailable",
      reason: "not_provided",
    });
  });
  it("stores the address encrypted and opens it back", () => {
    const sealed = sealShippingAddress(cipher, address);
    expect(sealed).not.toContain("Palmeiras");
    expect(openShippingAddress(cipher, sealed)).toEqual(address);
  });
  it("opens nothing when there is no address or another key sealed it", () => {
    const otherCipher = createTokenCipher(randomBytes(32).toString("base64"));
    expect(openShippingAddress(cipher, null)).toBeNull();
    expect(openShippingAddress(otherCipher, sealShippingAddress(cipher, address))).toBeNull();
  });
  it("answers not supported for marketplaces without a connector yet", async () => {
    const connector = createUnavailableConnector("shopee", "Shopee");
    expect(await connector.readShippingAddress?.(store, "1")).toEqual({
      kind: "unavailable",
      reason: "not_supported",
    });
  });
  it("delivers the simulated sale's address with the order", () => {
    const resource = encodeMockOrderResource({
      externalOrderId: "SIM-1",
      status: "paid",
      totalCents: 1000,
      marketplaceFeeCents: 100,
      buyerName: "Comprador simulado",
      shippingAddress: address,
      orderedAt: new Date(0).toISOString(),
      items: [{ externalListingId: "L1", title: "Caneca", quantity: 1, unitPriceCents: 1000 }],
    });
    expect(decodeMockOrderResource(resource).shippingAddress).toEqual(address);
  });
  it("keeps a simulated order whose address is malformed, without the address", () => {
    const resource = encodeMockOrderResource({
      externalOrderId: "SIM-2",
      status: "paid",
      totalCents: 1000,
      marketplaceFeeCents: 100,
      buyerName: "Comprador simulado",
      shippingAddress: { ...address, postalCode: "123" },
      orderedAt: new Date(0).toISOString(),
      items: [{ externalListingId: "L1", title: "Caneca", quantity: 1, unitPriceCents: 1000 }],
    });
    const order = decodeMockOrderResource(resource);
    expect(order.externalOrderId).toBe("SIM-2");
    expect(order.shippingAddress).toBeUndefined();
  });
});
