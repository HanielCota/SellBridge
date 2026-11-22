import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * The contract keeps SellBridge's share of each supplier payment out of the reseller's sight: it
 * comes out of the supplier's part. Every screen, message and text the reseller can reach is read
 * here, so a new sentence naming the fee fails the build instead of reaching a reseller.
 */
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const SCANNED_FOLDERS = ["apps/web/src", "apps/worker/src", "packages/shared/src"];
const SOURCE_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;
/** Reading about 2,000 files synchronously took up to 5 s in a busy run: past the default. */
const SCAN_TIMEOUT_IN_MS = 30_000;

/** Screens only the supplier or the SellBridge team open: the fee belongs there. */
const SUPPLIER_OR_TEAM_PATHS = [
  "apps/web/src/components/admin-problems/",
  "apps/web/src/components/admin-settings/",
  "apps/web/src/components/supplier-payments/asaas-receiving-card.tsx",
  "apps/web/src/components/supplier-payments/mercado-pago-account-card.tsx",
  "apps/web/src/components/supplier-payments/receiving-page.tsx",
  "apps/web/src/routes/_app/admin/",
  "apps/web/src/routes/_app/fornecedor/",
  // The terms of use wait for the lawyer's contract text (decision of 21/11/2026).
  "apps/web/src/routes/termos.tsx",
];

/** Lines that name the fee in a file the reseller also reaches, but only on a team screen. */
const TEAM_ONLY_LINES: readonly { path: string; line: string }[] = [
  {
    // The admin menu's settings entry.
    path: "apps/web/src/components/icons/action-icons.ts",
    line: 'hint: "A taxa do SellBridge nos pagamentos aos fornecedores",',
  },
  {
    // manualRefundExplanation: only the team's manual refund guide (admin-problems) shows it.
    path: "apps/web/src/features/supplier-payments/manual-refund-copy.ts",
    line: 'return "O Asaas só devolve um Pix quando a conta do fornecedor tem o valor inteiro livre. A taxa do SellBridge já saiu dessa conta e o resto está guardado, então a devolução não sai sozinha: alguém da equipe faz no Asaas.";',
  },
];

/**
 * The supplier's own contract with SellBridge states the fee (Central, 21/11/2026): these lines
 * only render in the supplier contract, never in the seller's, which the same file also holds,
 * and its page opens only for suppliers and the team (`SUPPLIER_CONTRACT_ROUTE`).
 */
const SUPPLIER_CONTRACT_LINES: readonly { path: string; line: string }[] = [
  {
    path: "packages/shared/src/domain/contract-documents.ts",
    line: 'text: "A SellBridge fica com 4% do preço do produto, sem contar o frete, separados no momento do pagamento.",',
  },
  {
    path: "packages/shared/src/domain/contract-documents.ts",
    line: '"O revendedor paga o pedido direto ao fornecedor. A SellBridge recebe 4% do preço do produto, sem contar o frete, separados automaticamente no momento do pagamento.",',
  },
];

/** The page that shows the supplier contract; resellers and visitors must stay out (22/11/2026). */
const SUPPLIER_CONTRACT_ROUTE = "apps/web/src/routes/contrato/fornecedor.tsx";

const FEE_MENTIONS = [
  /(taxa|tarifa|comiss[aã]o|percentual)\s+(do|da)\s+(sell\s?bridge|plataforma)/i,
  /sell\s?bridge\s+(fica com|recebe|cobra|desconta|ret[eé]m)\b/i,
  /plataforma\s+(cobra|fica com|recebe|desconta|ret[eé]m)\b/i,
  /(marketplace|marketplaces),?\s+(e\s+)?(do\s+)?sell\s?bridge/i,
];

function sourceFiles(folder: string): string[] {
  const entries = readdirSync(folder, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      return [path];
    }
    return [];
  });
}

function repositoryPath(path: string): string {
  return relative(REPOSITORY_ROOT, path).split(sep).join("/");
}

function isSupplierOrTeamFile(path: string): boolean {
  return SUPPLIER_OR_TEAM_PATHS.some((allowed) => path.startsWith(allowed));
}

const ALLOWED_LINES = [...TEAM_ONLY_LINES, ...SUPPLIER_CONTRACT_LINES];

function isAllowedLine(path: string, line: string): boolean {
  return ALLOWED_LINES.some((allowed) => allowed.path === path && allowed.line === line.trim());
}

/** Every line, outside supplier and team screens, that names SellBridge's fee. */
function resellerFeeMentions(): string[] {
  const files = SCANNED_FOLDERS.flatMap((folder) => sourceFiles(join(REPOSITORY_ROOT, folder)));
  return files.flatMap((file) => {
    const path = repositoryPath(file);
    if (isSupplierOrTeamFile(path)) {
      return [];
    }
    const lines = readFileSync(file, "utf8").split("\n");
    return lines.flatMap((line, index) => {
      const mentionsFee = FEE_MENTIONS.some((pattern) => pattern.test(line));
      if (!mentionsFee || isAllowedLine(path, line)) {
        return [];
      }
      return [`${path}:${index + 1}: ${line.trim()}`];
    });
  });
}

describe("SellBridge's fee on reseller screens", () => {
  let mentions: string[] = [];

  beforeAll(() => {
    mentions = resellerFeeMentions();
  }, SCAN_TIMEOUT_IN_MS);

  it("is named on no screen, message or text the reseller reaches", () => {
    expect(mentions).toEqual([]);
  });

  it("only reaches the supplier contract page behind the supplier gate", () => {
    const page = readFileSync(join(REPOSITORY_ROOT, SUPPLIER_CONTRACT_ROUTE), "utf8");

    expect(page).toContain("beforeLoad:");
    expect(page).toContain("supplierContractAccess(await getAppSession())");
  });

  it("would be caught if a reseller screen named it", () => {
    const sentence = "Além da mensalidade, a plataforma cobra 4% de cada venda.";

    expect(FEE_MENTIONS.some((pattern) => pattern.test(sentence))).toBe(true);
  });
});
