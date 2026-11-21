import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * The contract keeps SellBridge's share of each supplier payment out of the reseller's sight: it
 * comes out of the supplier's part. Every screen, message and text the reseller can reach is read
 * here, so a new sentence naming the fee fails the build instead of reaching a reseller.
 */
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const SCANNED_FOLDERS = ["apps/web/src", "apps/worker/src", "packages/shared/src"];
const SOURCE_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;

/** Screens only the supplier or the SellBridge team open: the fee belongs there. */
const SUPPLIER_OR_TEAM_PATHS = [
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
const TEAM_ONLY_LINES = ['hint: "A taxa do SellBridge nos pagamentos aos fornecedores",'];

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
      if (!mentionsFee || TEAM_ONLY_LINES.includes(line.trim())) {
        return [];
      }
      return [`${path}:${index + 1}: ${line.trim()}`];
    });
  });
}

describe("SellBridge's fee on reseller screens", () => {
  it("is named on no screen, message or text the reseller reaches", () => {
    expect(resellerFeeMentions()).toEqual([]);
  });

  it("would be caught if a reseller screen named it", () => {
    const sentence = "Além da mensalidade, a plataforma cobra 4% de cada venda.";

    expect(FEE_MENTIONS.some((pattern) => pattern.test(sentence))).toBe(true);
  });
});
