import { describe, expect, it } from "vitest";
import {
  blingOverviewFrom,
  blingStockLine,
  isBlingExportRunning,
  isBlingReadRunning,
  skippedProductsNote,
  type BlingConnectionView,
} from "./bling-overview";

const connection = {
  status: "connected" as const,
  accountName: null,
  connectedAt: new Date("2026-11-10T12:00:00Z"),
  lastImportAt: null,
  resellerDiscountTenths: 300,
  invoiceEnabledAt: null,
  stockCheckedAt: null,
  catalogExportRequestedAt: null,
  catalogExportFinishedAt: null,
  catalogExportResult: null,
};

const read = {
  id: "8b0e3c3e-2a43-4bf3-9f0e-6f1f3c0b9a11",
  status: "reading" as const,
  readProducts: 120,
  totalProducts: 400,
  error: null,
  startedAt: new Date("2026-11-10T12:05:00Z"),
};

const NOW = new Date("2026-11-10T12:10:00Z");

describe("blingOverviewFrom", () => {
  it("hides the Bling card while the app keys are not configured", () => {
    const overview = blingOverviewFrom({
      available: false,
      connection,
      read,
      fiscalReady: true,
      now: NOW,
    });

    expect(overview).toEqual({ available: false, connection: null, read: null });
  });

  it("shows the connection and the read in progress", () => {
    const overview = blingOverviewFrom({
      available: true,
      connection,
      read,
      fiscalReady: true,
      now: NOW,
    });

    expect(overview.connection).toMatchObject({
      status: "connected",
      connectedAt: "2026-11-10T12:00:00.000Z",
      resellerDiscountTenths: 300,
    });
    expect(overview.read).toMatchObject({ readProducts: 120, totalProducts: 400 });
  });

  it("tells since when the NF-e is on and whether the fiscal data is ready", () => {
    const enabled = { ...connection, invoiceEnabledAt: new Date("2026-11-10T13:00:00Z") };

    const overview = blingOverviewFrom({
      available: true,
      connection: enabled,
      read: null,
      fiscalReady: false,
      now: NOW,
    });

    expect(overview.connection).toMatchObject({
      invoiceEnabledAt: "2026-11-10T13:00:00.000Z",
      fiscalReady: false,
    });
  });

  it("ignores a read left from an account that is no longer connected", () => {
    const overview = blingOverviewFrom({
      available: true,
      connection: null,
      read,
      fiscalReady: true,
      now: NOW,
    });

    expect(overview).toEqual({ available: true, connection: null, read: null });
  });

  it("ends a read that stopped moving, so the supplier can start another", () => {
    const overview = blingOverviewFrom({
      available: true,
      connection,
      read,
      fiscalReady: true,
      now: new Date("2026-11-10T12:36:00Z"),
    });

    expect(overview.read).toMatchObject({
      status: "failed",
      error: "A leitura do Bling parou no meio. Clique em Importar do Bling para tentar de novo.",
    });
  });
});

describe("isBlingReadRunning", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const runningRead = {
    id: "read-1",
    status: "reading" as const,
    readProducts: 3,
    totalProducts: 10,
    error: null,
    startedAt: new Date(now.getTime() - 60_000),
  };

  it("sees a read that is still moving, so a second click does not start another", () => {
    const overview = blingOverviewFrom({
      available: true,
      connection,
      read: runningRead,
      fiscalReady: true,
      now,
    });

    expect(isBlingReadRunning(overview)).toBe(true);
  });

  it("lets a new read start once the old one stalled", () => {
    const stalled = { ...runningRead, startedAt: new Date(now.getTime() - 3_600_000) };

    const overview = blingOverviewFrom({
      available: true,
      connection,
      read: stalled,
      fiscalReady: true,
      now,
    });

    expect(isBlingReadRunning(overview)).toBe(false);
  });
});

describe("skippedProductsNote", () => {
  it("names both reasons a product is left out, not only a missing code", () => {
    expect(skippedProductsNote(2)).toBe(
      "2 produtos ficaram de fora por não ter código no Bling ou por repetir o código de outro produto.",
    );
  });

  it("uses the singular for one product", () => {
    expect(skippedProductsNote(1)).toContain("1 produto ficou de fora");
  });
});

describe("blingStockLine", () => {
  const view: BlingConnectionView = {
    status: "connected",
    accountName: null,
    connectedAt: "2026-11-10T12:00:00.000Z",
    lastImportAt: null,
    resellerDiscountTenths: null,
    invoiceEnabledAt: "2026-11-12T12:00:00.000Z",
    fiscalReady: true,
    stockCheckedAt: "2026-11-19T17:30:00.000Z",
    catalogExport: null,
  };

  it("says the stock follows Bling and when it was last checked", () => {
    expect(blingStockLine(view)).toMatch(
      /^Estoque atualizado sozinho pelo Bling · última conferência: .*14:30/,
    );
  });

  it("says the first check is on its way before it ran", () => {
    expect(blingStockLine({ ...view, stockCheckedAt: null })).toBe(
      "Estoque atualizado sozinho pelo Bling · a primeira conferência sai em até 15 minutos.",
    );
  });

  it("says the stock follows Bling even while the NF-e through Bling is off", () => {
    expect(blingStockLine({ ...view, invoiceEnabledAt: null })).toMatch(
      /^Estoque atualizado sozinho pelo Bling · última conferência: /,
    );
  });
});

describe("send to Bling", () => {
  interface ExportColumns {
    catalogExportRequestedAt?: Date | null;
    catalogExportFinishedAt?: Date | null;
    catalogExportResult?: unknown;
  }

  function exportOf(overrides: ExportColumns, now = NOW) {
    const overview = blingOverviewFrom({
      available: true,
      connection: { ...connection, ...overrides },
      read: null,
      fiscalReady: true,
      now,
    });
    return { overview, view: overview.connection?.catalogExport ?? null };
  }

  it("shows nothing before the first send", () => {
    expect(exportOf({}).view).toBeNull();
  });

  it("follows a send asked for after the last one ended", () => {
    const { overview, view } = exportOf({
      catalogExportRequestedAt: new Date("2026-11-10T12:08:00Z"),
      catalogExportFinishedAt: new Date("2026-11-09T12:00:00Z"),
    });

    expect(view).toEqual({ status: "sending", requestedAt: "2026-11-10T12:08:00.000Z" });
    expect(isBlingExportRunning(overview)).toBe(true);
  });

  it("shows what was created and each refused product with the reason", () => {
    const refused = [{ sku: "CHN-1", title: "Chinelo", reason: "O GTIN informado é inválido" }];

    const { overview, view } = exportOf({
      catalogExportRequestedAt: new Date("2026-11-10T12:00:00Z"),
      catalogExportFinishedAt: new Date("2026-11-10T12:04:00Z"),
      catalogExportResult: {
        kind: "done",
        created: 40,
        alreadyInErp: 12,
        refusedTotal: 1,
        refused,
      },
    });

    expect(view).toEqual({
      status: "done",
      finishedAt: "2026-11-10T12:04:00.000Z",
      created: 40,
      alreadyInErp: 12,
      refusedTotal: 1,
      refused,
    });
    expect(isBlingExportRunning(overview)).toBe(false);
  });

  it("tells why the send failed", () => {
    const { view } = exportOf({
      catalogExportRequestedAt: new Date("2026-11-10T12:00:00Z"),
      catalogExportFinishedAt: new Date("2026-11-10T12:04:00Z"),
      catalogExportResult: { kind: "failed", reason: "Conecte o Bling de novo." },
    });

    expect(view).toMatchObject({ status: "failed", reason: "Conecte o Bling de novo." });
  });

  it("calls a send still running after two hours stopped, so the supplier can send again", () => {
    const { view } = exportOf(
      { catalogExportRequestedAt: new Date("2026-11-10T09:00:00Z") },
      new Date("2026-11-10T11:30:00Z"),
    );

    expect(view).toMatchObject({
      status: "failed",
      reason: expect.stringContaining("parou no meio"),
    });
  });

  it("asks to send again when the stored result cannot be read", () => {
    const { view } = exportOf({
      catalogExportRequestedAt: new Date("2026-11-10T12:00:00Z"),
      catalogExportFinishedAt: new Date("2026-11-10T12:04:00Z"),
      catalogExportResult: { kind: "unknown" },
    });

    expect(view).toMatchObject({
      status: "failed",
      reason: expect.stringContaining("enviar de novo"),
    });
  });
});
