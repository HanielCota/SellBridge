import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contactEmail: vi.fn<() => Promise<string | null>>(),
  send: vi.fn<(email: { to: string; subject: string; text: string }) => Promise<void>>(),
  warn: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
  info: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findSupplierContactEmail: mocks.contactEmail,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://app.sellbridge.test" },
}));
vi.mock("@/lib/server/mailer", () => ({ sendEmail: mocks.send }));
vi.mock("@sellbridge/shared/logger", () => ({
  logger: { info: mocks.info, warn: mocks.warn, error: mocks.warn },
}));
import { noticeSupplierFlag } from "./supplier-flag-notice.server";

const input = {
  supplierId: "b90fe97c-fd21-4ce8-ab70-908f233c7038",
  reason: "order_error" as const,
  activeCount: 2,
  deactivated: false,
  supplierActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue();
});

describe("noticeSupplierFlag", () => {
  it("e-mails the brand contact with a link to the panel", async () => {
    mocks.contactEmail.mockResolvedValue("contato@fornecedor.com.br");
    await noticeSupplierFlag(input);
    const [email] = mocks.send.mock.calls[0] ?? [];
    expect(email?.to).toBe("contato@fornecedor.com.br");
    expect(email?.subject).toBe("Nova flag na sua conta: Erro em pedido");
    expect(email?.text).toContain("https://app.sellbridge.test/fornecedor/painel");
  });

  it("sends nothing to a brand without a contact e-mail", async () => {
    mocks.contactEmail.mockResolvedValue(null);
    await noticeSupplierFlag(input);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("never fails the flag when the e-mail can't go out", async () => {
    mocks.contactEmail.mockResolvedValue("contato@fornecedor.com.br");
    mocks.send.mockRejectedValue(new Error("smtp down"));
    await expect(noticeSupplierFlag(input)).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledWith(
      "supplier_flags.notice_failed",
      expect.objectContaining({ supplierId: input.supplierId }),
    );
  });
});
