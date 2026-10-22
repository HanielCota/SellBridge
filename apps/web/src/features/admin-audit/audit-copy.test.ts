import { describe, expect, it } from "vitest";
import { describeAuditEntry } from "./audit-copy";

const base = { details: null, subjectLabel: null };

describe("audit copy", () => {
  it("says what the team did in each source, in Portuguese", () => {
    expect(describeAuditEntry({ ...base, source: "account", action: "impersonated" })).toBe(
      "Entrou como o cliente",
    );
    expect(describeAuditEntry({ ...base, source: "catalog", action: "product.deactivated" })).toBe(
      "Desativou o produto",
    );
    expect(
      describeAuditEntry({
        ...base,
        source: "catalog",
        action: "catalog.csv_imported",
        details: { created: 3, updated: 1 },
      }),
    ).toBe("Importou produtos por CSV: 3 criados e 1 atualizado");
    expect(
      describeAuditEntry({
        ...base,
        source: "support",
        action: "ticket.status_changed",
        details: { from: "open", to: "closed" },
      }),
    ).toBe("Mudou o status para Encerrado");
    expect(
      describeAuditEntry({
        ...base,
        source: "support",
        action: "ticket.priority_changed",
        details: { from: "normal", to: "urgent" },
      }),
    ).toBe("Mudou a prioridade para Urgente");
  });

  it("names the reason of a supplier flag applied or revoked", () => {
    expect(
      describeAuditEntry({
        ...base,
        source: "catalog",
        action: "supplier.flag_applied",
        details: { flagId: "f-1", reason: "slow_support" },
      }),
    ).toBe("Aplicou uma flag ao fornecedor: Atraso para responder");
    expect(
      describeAuditEntry({
        ...base,
        source: "catalog",
        action: "supplier.flag_applied",
        details: { flagId: "f-1", reason: "unknown" },
      }),
    ).toBe("Aplicou uma flag ao fornecedor");
    expect(
      describeAuditEntry({ ...base, source: "catalog", action: "supplier.flag_revoked" }),
    ).toBe("Retirou uma flag do fornecedor");
  });

  it("falls back to a neutral line for an action it does not know", () => {
    expect(describeAuditEntry({ ...base, source: "catalog", action: "catalog.unknown" })).toBe(
      "Alteração no catálogo",
    );
    expect(describeAuditEntry({ ...base, source: "support", action: "ticket.new_kind" })).toBe(
      "Alteração no chamado",
    );
  });
});
