import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openCharge: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findBillingHolder: async () => ({
    fullName: "Ana Revendedora",
    cpf: "52998224725",
    company: null,
  }),
  findPayableShipment: async () => null,
}));
vi.mock("@sellbridge/payments/asaas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sellbridge/payments/asaas")>()),
  openAsaasCharge: mocks.openCharge,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/marketplaces", () => ({
  tokenCipher: { encrypt: (value: string) => value, decrypt: (value: string) => value },
}));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    APP_URL: "https://app.sellbridge.test",
    ADMIN_EMAILS: ["time@sellbridge.test"],
    ASAAS_API_URL: "https://asaas.test/v3",
    ASAAS_API_KEY: "platform-key",
    ASAAS_WALLET_ID: "wallet_sellbridge",
    ASAAS_WEBHOOK_TOKEN: "t".repeat(40),
  },
}));

import { AsaasError } from "@sellbridge/payments/asaas";
import { logger } from "@sellbridge/shared/logger";
import type {
  PayableShipment,
  ShipmentPayment,
  SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { openAsaasCheckout } from "./asaas-checkout.server";

const SUPPLIER_ID = "5f0c9a3e-6a1f-4d7e-9a43-8b2d1c3e4f50";
const payment: ShipmentPayment = {
  id: "0b8f7a6e-1c2d-4e3f-8a9b-7c6d5e4f3a21",
  shipmentId: "6a1f4d7e-9a43-4b2d-8c3e-4f505f0c9a3e",
  supplierId: SUPPLIER_ID,
  provider: "asaas",
  status: "pending",
  amountCents: 8000,
  platformFeeCents: 80,
  platformFeeBasisPoints: 100,
  preferenceId: null,
  checkoutUrl: null,
  checkoutExpiresAt: null,
  providerPaymentId: null,
  paymentMethod: null,
  paidAt: null,
  checkedAt: null,
  refundReason: null,
  refundRequestedAt: null,
  refundFailedAt: null,
  refundError: null,
  refundHeldAt: null,
  escrowId: null,
  escrowStatus: null,
  escrowExpiresAt: null,
  releaseRequestedAt: null,
  releasedAt: null,
  teamDecision: null,
  teamDecisionAt: null,
  teamDecisionByUserId: null,
  providerDeferredSince: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const account: SupplierPaymentAccount = {
  id: "account-1",
  supplierId: SUPPLIER_ID,
  provider: "asaas",
  providerAccountId: "acc_1",
  status: "connected",
  accessTokenEnc: "asaas-key",
  refreshTokenEnc: null,
  expiresAt: null,
  lastError: null,
  walletId: "wallet_supplier",
  reviewStatus: "approved",
  connectedByUserId: null,
  connectedAt: new Date(),
  updatedAt: new Date(),
};
const payable: PayableShipment = {
  shipmentId: payment.shipmentId,
  orderId: "order-1",
  externalOrderId: "2000123",
  supplierId: SUPPLIER_ID,
  supplierName: "Cestaria",
  catalogKind: "supplier",
  status: "forwarded",
  amountCents: 8000,
  payment,
};
const checkout = {
  tenantId: "tenant-1",
  payable,
  account,
  payment,
  payMethod: "PIX" as const,
  successUrl: "https://app.sellbridge.test/pedidos/1",
};

describe("openAsaasCheckout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.openCharge.mockReset();
  });

  it("logs Asaas's own reason when Asaas refuses the charge", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    mocks.openCharge.mockRejectedValue(
      new AsaasError("Asaas answered 400 on /v3/payments", {
        status: 400,
        codes: ["invalid_object"],
        issues: ["A data de vencimento é inválida."],
      }),
    );

    await expect(openAsaasCheckout(checkout)).rejects.toThrow(/Não conseguimos conferir/);

    expect(warn).toHaveBeenCalledWith(
      "asaas.checkout_failed",
      expect.objectContaining({
        status: 400,
        codes: ["invalid_object"],
        issues: ["A data de vencimento é inválida."],
      }),
    );
  });
});
