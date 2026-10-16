import type {
  forwardOrder,
  forwardRecipients,
  noteSupplierEmailFailed,
} from "@sellbridge/database/repositories";
import type { OutgoingEmail } from "@sellbridge/shared/mailer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forward: vi.fn<typeof forwardOrder>(),
  recipients: vi.fn<typeof forwardRecipients>(),
  noteFailed: vi.fn<typeof noteSupplierEmailFailed>(),
  sendEmail: vi.fn<(email: OutgoingEmail) => Promise<void>>(),
  warn: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  forwardOrder: mocks.forward,
  forwardRecipients: mocks.recipients,
  noteSupplierEmailFailed: mocks.noteFailed,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://app.sellbridge.test" },
}));
vi.mock("@/lib/server/mailer", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@sellbridge/shared/logger", () => ({
  logger: {
    warn: mocks.warn,
    info: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
    error: mocks.warn,
  },
}));
import { forwardAndNotify } from "./forward.server";

const tenantId = "8e7c0f7e-6a51-4f43-9d2c-3b1a1f0e2a11";
const input = {
  orderId: "0b8f6c1e-5d43-4a2b-9c1d-7e6f5a4b3c2d",
  address: {
    recipient: "Maria Silva",
    street: "Rua das Flores",
    number: "10",
    complement: "",
    neighborhood: "Centro",
    city: "São Paulo",
    state: "SP",
    postalCode: "01001-000",
  },
  notes: "",
};
const recipient = {
  externalOrderId: "2000012345",
  supplierName: "Ateliê",
  acceptWithinHours: 24,
  dispatchWithinHours: 48,
  items: [{ title: "Vestido", sku: "VM-01", quantity: 1 }],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.forward.mockResolvedValue([
    { shipmentId: "ship-mail", supplierId: "sup-mail", token: "token-mail" },
    { shipmentId: "ship-none", supplierId: "sup-none", token: "token-none" },
  ]);
  mocks.recipients.mockResolvedValue([
    { ...recipient, shipmentId: "ship-mail", contactEmail: "pedidos@ateliê.test" },
    { ...recipient, shipmentId: "ship-none", contactEmail: null },
  ]);
  mocks.sendEmail.mockResolvedValue(undefined);
});

describe("forwardAndNotify", () => {
  it("e-mails the link only to the suppliers that have an e-mail", async () => {
    const links = await forwardAndNotify(tenantId, input);

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const [email] = mocks.sendEmail.mock.calls[0] ?? [];
    expect(email?.to).toBe("pedidos@ateliê.test");
    expect(email?.text).toContain("https://app.sellbridge.test/fornecedor/pedido/token-mail");
    expect(links).toEqual([
      expect.objectContaining({ shipmentId: "ship-mail", token: "token-mail", emailed: true }),
      expect.objectContaining({ shipmentId: "ship-none", token: "token-none", emailed: false }),
    ]);
  });

  it("keeps the forward when the e-mail fails, notes it and logs no contact data", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("provider down"));

    const links = await forwardAndNotify(tenantId, input);

    expect(links[0]?.emailed).toBe(false);
    expect(mocks.noteFailed).toHaveBeenCalledWith({}, tenantId, "ship-mail");
    expect(mocks.warn).toHaveBeenCalledWith(
      "fulfillment.supplier_email_failed",
      expect.objectContaining({ shipmentId: "ship-mail" }),
    );
    const logged = JSON.stringify(mocks.warn.mock.calls);
    expect(logged).not.toContain("pedidos@");
    expect(logged).not.toContain("token-mail");
  });
});
