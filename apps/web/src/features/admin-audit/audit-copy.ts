import { SELLER_PRODUCT_ACTION_LABELS } from "@/features/seller-products/action-labels";
import type { AuditEntry } from "@sellbridge/database/repositories";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@sellbridge/shared/schemas";
import { describeAdminEvent } from "@/features/admin/admin-actions";
import {
  SUPPLIER_FLAG_REASON_LABELS,
  SUPPLIER_FLAG_REASONS,
} from "@sellbridge/shared/supplier-flags";

type AuditDetails = AuditEntry["details"];
type DescribedEntry = Pick<AuditEntry, "source" | "action" | "details" | "subjectLabel">;

/** The catalog actions the admin's supplier screens record (see `catalog-audit.server.ts`). */
const CATALOG_COPY: Readonly<Record<string, string>> = {
  ...SELLER_PRODUCT_ACTION_LABELS,
  "supplier.created": "Cadastrou o fornecedor",
  "supplier.updated": "Editou o fornecedor",
  "supplier.activated": "Ativou o fornecedor",
  "supplier.deactivated": "Desativou o fornecedor",
  "product.created": "Cadastrou o produto",
  "product.updated": "Editou o produto",
  "product.activated": "Ativou o produto",
  "product.deactivated": "Desativou o produto",
  "supplier.flag_applied": "Aplicou uma flag ao fornecedor",
  "supplier.flag_revoked": "Retirou uma flag do fornecedor",
};

const STATUS_LABELS: Readonly<Record<string, string>> = TICKET_STATUS_LABELS;
const PRIORITY_LABELS: Readonly<Record<string, string>> = TICKET_PRIORITY_LABELS;
const CATEGORY_LABELS: Readonly<Record<string, string>> = TICKET_CATEGORY_LABELS;

function textDetail(details: AuditDetails, key: string): string | null {
  const value = details?.[key];
  return typeof value === "string" ? value : null;
}

function countDetail(details: AuditDetails, key: string): number {
  const value = details?.[key];
  return typeof value === "number" ? value : 0;
}

function plural(count: number, one: string, other: string): string {
  return `${count} ${count === 1 ? one : other}`;
}

/** "Aplicou uma flag ao fornecedor: Erro em pedido" (MVP function 6). */
function describeFlagApplied(details: AuditDetails): string {
  const reason = SUPPLIER_FLAG_REASONS.find((known) => known === textDetail(details, "reason"));
  if (reason === undefined) {
    return "Aplicou uma flag ao fornecedor";
  }
  return `Aplicou uma flag ao fornecedor: ${SUPPLIER_FLAG_REASON_LABELS[reason]}`;
}

function describeCatalog(action: string, details: AuditDetails): string {
  if (action === "supplier.flag_applied") {
    return describeFlagApplied(details);
  }
  if (action === "catalog.csv_imported") {
    const created = plural(countDetail(details, "created"), "criado", "criados");
    const updated = plural(countDetail(details, "updated"), "atualizado", "atualizados");
    return `Importou produtos por CSV: ${created} e ${updated}`;
  }
  return CATALOG_COPY[action] ?? "Alteração no catálogo";
}

function labelOf(labels: Readonly<Record<string, string>>, value: string | null): string {
  if (value === null) {
    return "—";
  }
  return labels[value] ?? value;
}

const SUPPORT_COPY: Readonly<Record<string, (to: string | null, from: string | null) => string>> = {
  "ticket.status_changed": (to) => `Mudou o status para ${labelOf(STATUS_LABELS, to)}`,
  "ticket.priority_changed": (to) => `Mudou a prioridade para ${labelOf(PRIORITY_LABELS, to)}`,
  "ticket.category_changed": (to) => `Mudou o tema para ${labelOf(CATEGORY_LABELS, to)}`,
  "ticket.assigned": (to) => (to === null ? "Tirou o responsável" : "Definiu o responsável"),
  "ticket.order_linked": (to) => `Vinculou o pedido #${to ?? ""}`,
  "ticket.order_unlinked": (_to, from) => `Desvinculou o pedido #${from ?? ""}`,
  "ticket.follower_added": () => "Adicionou um colega ao chamado",
};

function describeSupport(action: string, details: AuditDetails): string {
  const copy = SUPPORT_COPY[action];
  if (copy === undefined) {
    return "Alteração no chamado";
  }
  return copy(textDetail(details, "to"), textDetail(details, "from"));
}

/** One line of the audit, in the team's words. */
export function describeAuditEntry(entry: DescribedEntry): string {
  if (entry.source === "account") {
    return describeAdminEvent(entry.action, entry.details);
  }
  if (entry.source === "catalog") {
    return describeCatalog(entry.action, entry.details);
  }
  return describeSupport(entry.action, entry.details);
}

export const AUDIT_SOURCE_LABELS: Record<AuditEntry["source"], string> = {
  account: "Conta do cliente",
  catalog: "Catálogo",
  support: "Suporte",
};
