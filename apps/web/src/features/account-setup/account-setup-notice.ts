import type { PaymentAccountReviewStatus } from "@sellbridge/shared/payment-accounts";
import { blingConnectHref } from "@/features/supplier-panel/bling/bling-connection";

/**
 * Where the supplier's Asaas receiving account stands: not open, waiting for the supplier's
 * documents, under Asaas's review, refused, or approved.
 */
export type ReceivingAccountState = "closed" | "documents" | "in_review" | "rejected" | "approved";

export function receivingAccountState(
  account: { status: string; reviewStatus: PaymentAccountReviewStatus | null } | null,
): ReceivingAccountState {
  if (account === null || account.status !== "connected") {
    return "closed";
  }
  if (account.reviewStatus === "approved") {
    return "approved";
  }
  if (account.reviewStatus === "rejected") {
    return "rejected";
  }
  // Asaas's "pending" asks the supplier for documents; "awaiting approval" is Asaas's turn.
  return account.reviewStatus === "awaiting_approval" ? "in_review" : "documents";
}

/** What the header knows about a supplier profile's setup. */
export interface SupplierSetupFacts {
  /** Null while Asaas is not configured on the server: nobody can open an account yet. */
  readonly receivingAccount: ReceivingAccountState | null;
  /** The supplier whose Bling lost its authorization, or null. */
  readonly blingToReconnect: string | null;
  readonly products: number;
  /** Products sent past the draft (under review, approved or refused). */
  readonly submittedProducts: number;
  /** Venda à ordem is chosen, but no connected Bling issues its notes. */
  readonly onBehalfInvoiceOff: boolean;
}

/** What the header knows about a reseller profile's setup. */
export interface ResellerSetupFacts {
  /** Null until the first step of the setup saved it: the setup guide asks for it. */
  readonly holder: {
    readonly company: { readonly stateRegistration: string | null } | null;
    readonly address: unknown;
  } | null;
}

/** The pages a notice leads to; the header draws each one with its own typed link. */
export type SetupNoticePage = "receiving" | "new-product" | "products" | "brand" | "company-data";

/** Where each page lives, to leave the notice out on the page that already shows the item. */
const PAGE_PATHS: Record<SetupNoticePage, string> = {
  receiving: "/fornecedor/painel/recebimentos",
  "new-product": "/fornecedor/painel/produtos",
  products: "/fornecedor/painel/produtos",
  brand: "/fornecedor/painel/marca",
  "company-data": "/onboarding",
};

export type SetupNoticeTarget =
  | { readonly kind: "page"; readonly page: SetupNoticePage }
  | { readonly kind: "authorization"; readonly href: string };

export interface SetupNotice {
  readonly key: string;
  /** What is missing; the computer shows it before the action, the phone only the action. */
  readonly message: string;
  /** The button's words: they must make sense alone, the phone shows nothing else. */
  readonly action: string;
  /** Why it matters, as the hover text. */
  readonly reason: string;
  readonly target: SetupNoticeTarget;
}

const RECEIVING_PAGE: SetupNoticeTarget = { kind: "page", page: "receiving" };
const RECEIVING_REASON = "Sem a conta de recebimento você não recebe o pagamento das vendas.";

const RECEIVING_NOTICES: Partial<Record<ReceivingAccountState, SetupNotice>> = {
  closed: {
    key: "receiving-account-closed",
    message: "Sua conta de recebimento não está aberta",
    action: "Abrir conta para receber",
    reason: RECEIVING_REASON,
    target: RECEIVING_PAGE,
  },
  rejected: {
    key: "receiving-account-rejected",
    message: "O Asaas recusou sua conta de recebimento",
    action: "Ver o que corrigir",
    reason: RECEIVING_REASON,
    target: RECEIVING_PAGE,
  },
  documents: {
    key: "receiving-account-documents",
    message: "Sua conta de recebimento espera seus documentos",
    action: "Enviar documentos",
    reason: RECEIVING_REASON,
    target: RECEIVING_PAGE,
  },
};

function blingReconnectNotice(supplierId: string): SetupNotice {
  return {
    key: "bling-reconnect",
    message: "Seu Bling precisa ser reconectado",
    action: "Reconectar o Bling",
    reason:
      "Seu Bling precisa ser reconectado para o SellBridge continuar lendo o estoque e emitindo notas.",
    target: { kind: "authorization", href: blingConnectHref(supplierId) },
  };
}

const NO_PRODUCTS: SetupNotice = {
  key: "no-products",
  message: "Você ainda não tem produtos no catálogo",
  action: "Cadastrar produto",
  reason: "Os revendedores só vendem o que você cadastra e publica.",
  target: { kind: "page", page: "new-product" },
};

const PRODUCTS_IN_DRAFT: SetupNotice = {
  key: "products-in-draft",
  message: "Seus produtos estão em rascunho",
  action: "Publicar produtos",
  reason: "Produto em rascunho não aparece para os revendedores.",
  target: { kind: "page", page: "products" },
};

const ON_BEHALF_INVOICE_OFF: SetupNotice = {
  key: "on-behalf-invoice-off",
  message: "A nota da venda à ordem está desligada",
  action: "Ligar a nota fiscal",
  reason: "Sem o Bling ligado, a etiqueta sai sem a nota da venda à ordem.",
  target: { kind: "page", page: "brand" },
};

const COMPANY_DATA_PAGE: SetupNoticeTarget = { kind: "page", page: "company-data" };

const COMPANY_ADDRESS: SetupNotice = {
  key: "company-address",
  message: "Falta o endereço da sua empresa",
  action: "Completar dados da empresa",
  reason: "Sem o endereço da empresa, a nota da venda à ordem não sai.",
  target: COMPANY_DATA_PAGE,
};

const COMPANY_STATE_REGISTRATION: SetupNotice = {
  key: "company-state-registration",
  message: "Falta a inscrição estadual da sua empresa",
  action: "Completar dados da empresa",
  reason: "A nota da venda à ordem leva a inscrição estadual da sua empresa, ou que ela é isenta.",
  target: COMPANY_DATA_PAGE,
};

/**
 * The supplier's most important missing setup item: getting paid first, then the notes, then
 * something to sell. Null when nothing is missing.
 */
export function nextSupplierSetupNotice(facts: SupplierSetupFacts): SetupNotice | null {
  const receiving =
    facts.receivingAccount === null ? undefined : RECEIVING_NOTICES[facts.receivingAccount];
  if (receiving !== undefined) {
    return receiving;
  }
  if (facts.blingToReconnect !== null) {
    return blingReconnectNotice(facts.blingToReconnect);
  }
  if (facts.products === 0) {
    return NO_PRODUCTS;
  }
  if (facts.submittedProducts === 0) {
    return PRODUCTS_IN_DRAFT;
  }
  return facts.onBehalfInvoiceOff ? ON_BEHALF_INVOICE_OFF : null;
}

/**
 * The reseller's missing data that stops a venda à ordem note. The steps of the setup guide (data,
 * supplier, e-mail, store, first listing) are not repeated here: its strip already shows them.
 */
export function nextResellerSetupNotice(facts: ResellerSetupFacts): SetupNotice | null {
  const company = facts.holder?.company ?? null;
  if (facts.holder === null || company === null) {
    return null;
  }
  if (facts.holder.address === null) {
    return COMPANY_ADDRESS;
  }
  return company.stateRegistration === null ? COMPANY_STATE_REGISTRATION : null;
}

/** The notice's own page already shows the item: the header leaves it out there. */
export function isOnNoticePage(notice: SetupNotice, pathname: string): boolean {
  if (notice.target.kind !== "page") {
    return false;
  }
  const path = PAGE_PATHS[notice.target.page];
  return pathname === path || pathname.startsWith(`${path}/`);
}
