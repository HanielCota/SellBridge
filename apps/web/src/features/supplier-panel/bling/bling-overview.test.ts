import { describe, expect, it } from "vitest";
import { blingOverviewFrom } from "./bling-overview";

const connection = {
  status: "connected" as const,
  accountName: null,
  connectedAt: new Date("2026-11-10T12:00:00Z"),
  lastImportAt: null,
  resellerDiscountTenths: 300,
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
    const overview = blingOverviewFrom({ available: false, connection, read, now: NOW });

    expect(overview).toEqual({ available: false, connection: null, read: null });
  });

  it("shows the connection and the read in progress", () => {
    const overview = blingOverviewFrom({ available: true, connection, read, now: NOW });

    expect(overview.connection).toMatchObject({
      status: "connected",
      connectedAt: "2026-11-10T12:00:00.000Z",
      resellerDiscountTenths: 300,
    });
    expect(overview.read).toMatchObject({ readProducts: 120, totalProducts: 400 });
  });

  it("ignores a read left from an account that is no longer connected", () => {
    const overview = blingOverviewFrom({ available: true, connection: null, read, now: NOW });

    expect(overview).toEqual({ available: true, connection: null, read: null });
  });

  it("ends a read that stopped moving, so the supplier can start another", () => {
    const overview = blingOverviewFrom({
      available: true,
      connection,
      read,
      now: new Date("2026-11-10T12:36:00Z"),
    });

    expect(overview.read).toMatchObject({
      status: "failed",
      error: "A leitura do Bling parou no meio. Clique em Importar do Bling para tentar de novo.",
    });
  });
});
