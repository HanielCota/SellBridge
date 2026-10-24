import { describe, expect, it } from "vitest";
import { auditActorLabel, describeAuditEntry } from "./audit-copy";

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

  it("says when the 3rd flag put the supplier out, apart from a deactivation by hand", () => {
    const deactivated = { ...base, source: "catalog" as const, action: "supplier.deactivated" };
    expect(
      describeAuditEntry({ ...deactivated, details: { pausedTargets: 2, cause: "third_flag" } }),
    ).toBe("Desativou o fornecedor na 3ª flag");
    expect(describeAuditEntry({ ...deactivated, details: { pausedTargets: 2 } })).toBe(
      "Desativou o fornecedor",
    );
  });

  it("names a refused contact by its kinds, on an account or a supplier link", () => {
    const details = { channel: "seller_app", field: "notes", kinds: "phone,email", tenantId: null };
    expect(
      describeAuditEntry({ ...base, source: "account", action: "contact_blocked", details }),
    ).toBe("Tentou enviar telefone e e-mail no pedido (bloqueado)");
    expect(
      describeAuditEntry({
        ...base,
        source: "catalog",
        action: "contact_blocked",
        details: { ...details, kinds: "social" },
      }),
    ).toBe("Tentou enviar rede social no pedido (bloqueado)");
  });

  it("names who tried to send a contact: the customer or the supplier's link, not a removed user", () => {
    const blocked = { action: "contact_blocked", actorName: null };
    expect(auditActorLabel({ ...blocked, source: "account" })).toBe("O próprio cliente");
    expect(auditActorLabel({ ...blocked, source: "catalog" })).toBe("Fornecedor pelo link");
    expect(auditActorLabel({ action: "impersonated", actorName: null, source: "account" })).toBe(
      "Usuário removido",
    );
    expect(auditActorLabel({ action: "impersonated", actorName: "Ana", source: "account" })).toBe(
      "Ana",
    );
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
