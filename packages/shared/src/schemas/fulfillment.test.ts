import { describe, expect, it } from "vitest";
import { CONTACT_DETAILS_REASON, CONTACT_DETAILS_REFUSED } from "./contact-guard.ts";
import {
  forwardOrderSchema,
  operationsUrlSearchSchema,
  shipmentUpdateSchema,
} from "./fulfillment.ts";
const input = {
  shipmentId: "36e45c9e-8db0-4c67-b889-6c2fc1c19087",
  status: "shipped",
  carrier: "Correios",
  trackingCode: "AB123BR",
  trackingUrl: "https://rastreamento.correios.com.br",
  note: "",
};
describe("fulfillment input", () => {
  it("requires tracking on dispatch", () => {
    expect(shipmentUpdateSchema.safeParse({ ...input, trackingCode: "" }).success).toBe(false);
  });
  it("requires a reason to cancel", () => {
    expect(shipmentUpdateSchema.safeParse({ ...input, status: "cancelled" }).success).toBe(false);
  });
  it.each(["javascript:alert(1)", "http://example.com", "data:text/html,test"])(
    "rejects unsafe tracking links %s",
    (trackingUrl) => {
      expect(shipmentUpdateSchema.safeParse({ ...input, trackingUrl }).success).toBe(false);
    },
  );
  it("allows an HTTPS tracking URL", () => {
    expect(shipmentUpdateSchema.safeParse(input).success).toBe(true);
  });
});

describe("operations address bounds", () => {
  it("keeps the deepest page the server serves", () => {
    expect(operationsUrlSearchSchema.parse({ opPage: "10000" }).opPage).toBe(10_000);
  });

  // Regression: page 10001 passed the address and the server refused it, so the tab showed an
  // error instead of a list.
  it.each(["10001", "0", "-1", "1.5", "abc"])("falls back to page 1 for %s", (opPage) => {
    expect(operationsUrlSearchSchema.parse({ opPage }).opPage).toBe(1);
  });

  it("keeps the first 100 characters of a longer search", () => {
    expect(operationsUrlSearchSchema.parse({ opQuery: "x".repeat(120) }).opQuery).toBe(
      "x".repeat(100),
    );
  });
});

const forward = {
  orderId: "36e45c9e-8db0-4c67-b889-6c2fc1c19087",
  address: {
    recipient: "Maria Teste",
    street: "Rua das Flores",
    number: "100",
    complement: "Apto 12",
    neighborhood: "Centro",
    city: "São Paulo",
    state: "SP",
    postalCode: "01310-100",
  },
  notes: "Embalar com plástico bolha",
};

/** The issue a contact detail raises, so the server can log it without the text. */
function contactIssue(result: { success: boolean; error?: { issues: readonly unknown[] } }) {
  return result.error?.issues.find(
    (issue) =>
      typeof issue === "object" &&
      issue !== null &&
      "message" in issue &&
      issue.message === CONTACT_DETAILS_REFUSED,
  );
}

describe("contact details between reseller and supplier", () => {
  it("lets ordinary instructions and occurrences through", () => {
    expect(forwardOrderSchema.safeParse(forward).success).toBe(true);
    const note = "Pedido MLB1234567890, rastreio AA123456789BR, CEP 01310-100";
    expect(shipmentUpdateSchema.safeParse({ ...input, note }).success).toBe(true);
  });

  it.each([
    ["the instructions", { notes: "Me chama no (11) 98765-4321" }, ["notes"]],
    [
      "the address complement",
      { address: { ...forward.address, complement: "ligar 11987654321" } },
      ["address", "complement"],
    ],
    [
      "the address number",
      { address: { ...forward.address, number: "11987654321" } },
      ["address", "number"],
    ],
    [
      "the recipient",
      { address: { ...forward.address, recipient: "Maria zap 11 98765-4321" } },
      ["address", "recipient"],
    ],
    [
      "the street",
      { address: { ...forward.address, street: "Rua X (ligue 11 98765-4321)" } },
      ["address", "street"],
    ],
    [
      "the neighborhood",
      { address: { ...forward.address, neighborhood: "fulano@gmail.com" } },
      ["address", "neighborhood"],
    ],
    [
      "the city",
      { address: { ...forward.address, city: "insta: fulano.loja" } },
      ["address", "city"],
    ],
  ] as const)("refuses a contact in %s of the forward", (_field, change, path) => {
    const result = forwardOrderSchema.safeParse({ ...forward, ...change });
    expect(result.success).toBe(false);
    expect(contactIssue(result)).toMatchObject({
      path,
      params: { reason: CONTACT_DETAILS_REASON },
    });
  });

  it.each([
    ["note", { note: "fulano arroba gmail ponto com" }],
    ["carrier", { carrier: "Moto do João 11 98765-4321" }],
    ["trackingUrl", { trackingUrl: "https://wa.me/5511987654321" }],
    ["trackingUrl", { trackingUrl: "https://instagram.com/fulano" }],
    ["trackingUrl", { trackingUrl: "https://wa.me./5511987654321" }],
    ["trackingUrl", { trackingUrl: "https://bit.ly/abc" }],
    ["trackingUrl", { trackingUrl: "https://wa.link/abc" }],
    ["trackingUrl", { trackingUrl: "https://linktr.ee/fulano" }],
    ["trackingUrl", { trackingUrl: "https://instagram.com.br/fulano" }],
    ["trackingUrl", { trackingUrl: "https://www.threads.net/@fulano" }],
    ["trackingUrl", { trackingUrl: "https://rastreio.com/?tel=11987654321" }],
    ["trackingUrl", { trackingUrl: "https://rastreio.com/fulano@gmail.com" }],
    ["trackingCode", { trackingCode: "11987654321" }],
    ["trackingCode", { trackingCode: "@fulano.loja" }],
  ] as const)("refuses a contact in the shipment %s", (field, change) => {
    const result = shipmentUpdateSchema.safeParse({ ...input, ...change });
    expect(result.success).toBe(false);
    expect(contactIssue(result)).toMatchObject({
      path: [field],
      params: { reason: CONTACT_DETAILS_REASON },
    });
  });

  it("keeps real addresses, tracking codes and carrier links", () => {
    for (const street of [
      "Rua 25 de Março, 1234",
      "Rua Doze de Outubro, 4321",
      "Alameda Santos, 2222 - 3333",
    ]) {
      expect(
        forwardOrderSchema.safeParse({ ...forward, address: { ...forward.address, street } })
          .success,
      ).toBe(true);
    }
    for (const trackingCode of ["AA123456789BR", "LB987654321HK", "JD-0012345"]) {
      expect(shipmentUpdateSchema.safeParse({ ...input, trackingCode }).success).toBe(true);
    }
    const trackingUrl = "https://www.linkcorreios.com.br/?id=AA123456789BR";
    expect(shipmentUpdateSchema.safeParse({ ...input, trackingUrl }).success).toBe(true);
  });

  it("answers a malformed tracking link with a message, not a crash", () => {
    // Zod runs the refinements even after `z.url()` refused the text, so they must not parse it
    // blindly. A space in the host is unparseable in every URL parser.
    const result = shipmentUpdateSchema.safeParse({ ...input, trackingUrl: "https://wa me/x" });
    expect(result.success).toBe(false);
  });

  it("tells the person what to do instead", () => {
    expect(CONTACT_DETAILS_REFUSED).toBe(
      "Por segurança, telefone, e-mail e redes sociais não podem ser enviados por aqui. Converse pelas mensagens do pedido.",
    );
  });
});
