import { describe, expect, it } from "vitest";
import {
  emailSupplierLinks,
  supplierOrderEmail,
  supplierPanelOrderUrl,
  type SupplierRecipient,
} from "./supplier-order-email.ts";

const order = {
  externalOrderId: "2000012345",
  items: [
    { title: "Vestido midi", sku: "VM-01", quantity: 2 },
    { title: "Blusa <b>linho</b>", sku: "", quantity: 1 },
  ],
  acceptWithinHours: 12,
  dispatchWithinHours: 48,
  link: "https://app.sellbridge.com.br/fornecedor/pedido/token-secreto",
  hasPanel: false,
};

const APP_URL = "https://app.sellbridge.com.br";

describe("supplierOrderEmail", () => {
  it("names the order, lists the items and states both deadlines", () => {
    const email = supplierOrderEmail(order, "https://app.sellbridge.com.br");
    expect(email.subject).toBe("Novo pedido #2000012345 para separar");
    expect(email.text).toContain("2 × Vestido midi (VM-01)");
    expect(email.text).toContain("1 × Blusa <b>linho</b>");
    expect(email.text).toContain("aceite em até 12 horas");
    expect(email.text).toContain("despache em até 48 horas");
    expect(email.text).toContain(order.link);
  });

  it("links to the order in the HTML and escapes what came from the marketplace", () => {
    const email = supplierOrderEmail(order, "https://app.sellbridge.com.br");
    expect(email.html).toContain(`href="${order.link}"`);
    expect(email.html).toContain("Blusa &lt;b&gt;linho&lt;/b&gt;");
    expect(email.html).not.toContain("<b>linho</b>");
  });

  it("speaks of days when a deadline is a whole number of days", () => {
    const email = supplierOrderEmail(
      { ...order, acceptWithinHours: 24, dispatchWithinHours: 72 },
      "https://app.sellbridge.com.br",
    );
    expect(email.text).toContain("aceite em até 1 dia");
    expect(email.text).toContain("despache em até 3 dias");
  });

  it("never carries the buyer's address: the supplier reads it behind the link", () => {
    const email = supplierOrderEmail(order, "https://app.sellbridge.com.br");
    expect(email.text).toContain("O endereço de entrega está no link");
  });
});

describe("supplierOrderEmail for a supplier with a panel", () => {
  it("sends the supplier to the order in its panel, with no link to share", () => {
    const panelOrder = {
      ...order,
      hasPanel: true,
      link: "https://app.sellbridge.com.br/fornecedor/painel/pedidos?query=2000012345",
    };

    const email = supplierOrderEmail(panelOrder, APP_URL);

    expect(email.html).toContain(`href="${panelOrder.link}"`);
    expect(email.text).toContain("Abrir no painel");
    expect(email.text).toContain("estão no seu painel");
    expect(email.text).not.toContain("O link vale por 30 dias");
  });

  it("invites a supplier without a panel to create its access", () => {
    const email = supplierOrderEmail(order, APP_URL);

    expect(email.text).toContain("Criar meu acesso ao painel");
  });
});

describe("emailSupplierLinks", () => {
  const recipient: SupplierRecipient = {
    shipmentId: "parcel-panel",
    contactEmail: "pedidos@fornecedor.com.br",
    externalOrderId: "2000012345",
    items: order.items,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
    hasPanel: true,
  };

  it("e-mails a panel supplier its panel address and never the parcel link", async () => {
    const sent: { to: string; text: string }[] = [];

    const emailed = await emailSupplierLinks({
      recipients: [recipient],
      links: [{ shipmentId: "parcel-panel", token: "token-secreto" }],
      appUrl: APP_URL,
      send: async (message) => {
        sent.push({ to: message.to, text: message.text });
      },
      onFailure: async () => undefined,
    });

    expect(emailed).toEqual(new Set(["parcel-panel"]));
    expect(sent[0]?.text).toContain(supplierPanelOrderUrl("2000012345", APP_URL));
    expect(sent[0]?.text).not.toContain("token-secreto");
  });

  it("e-mails a supplier without a panel the parcel link", async () => {
    const sent: string[] = [];

    await emailSupplierLinks({
      recipients: [{ ...recipient, hasPanel: false }],
      links: [{ shipmentId: "parcel-panel", token: "token-secreto" }],
      appUrl: APP_URL,
      send: async (message) => {
        sent.push(message.text);
      },
      onFailure: async () => undefined,
    });

    expect(sent[0]).toContain("/fornecedor/pedido/token-secreto");
  });
});

describe("supplierPanelOrderUrl", () => {
  it("keeps a numeric order number a string the panel search reads back", () => {
    const url = new URL(supplierPanelOrderUrl("20006434908", "https://app.sellbridge.com.br"));

    const query = url.searchParams.get("query");

    expect(url.pathname).toBe("/fornecedor/painel/pedidos");
    expect(JSON.parse(query ?? "null")).toBe("20006434908");
  });
});
