import { parseProductCsv } from "@sellbridge/shared/product-csv";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  confirmAdminProductCsv,
  previewAdminProductCsv,
} from "@/features/admin-suppliers/suppliers.server";

const mocks = vi.hoisted(() => ({
  preview: vi.fn<typeof previewAdminProductCsv>(),
  confirm: vi.fn<typeof confirmAdminProductCsv>(),
  log: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@/features/admin-suppliers/suppliers.server", () => ({
  previewAdminProductCsv: mocks.preview,
  confirmAdminProductCsv: mocks.confirm,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@sellbridge/shared/logger", () => ({
  logger: { info: mocks.log, warn: mocks.log, error: mocks.log },
}));
import { confirmSupplierImport, previewSupplierImport } from "./supplier-import.server";

const supplierId = "b90fe97c-fd21-4ce8-ab70-908f233c7038";
const token = "a".repeat(64);

function fileBase64(text: string): string {
  return Buffer.from(text, "latin1").toString("base64");
}

/** Runs the real product-csv rules, as the admin preview does, without the database. */
function fakePreview(input: { supplierId: string; content: string }) {
  const parsed = parseProductCsv(input.content);
  return Promise.resolve({
    created: parsed.rows.length,
    updated: 0,
    errors: parsed.errors,
    previewToken: token,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockImplementation(fakePreview);
});

describe("previewSupplierImport", () => {
  it("reports failed rows by their own line and prepares only the valid ones", async () => {
    const file = [
      "sku,titulo,custo,estoque",
      'A-1,Pão,"12,90",1',
      "",
      "A-2,Feijão,doze,1",
      "A-3,Arroz,5.00,2",
    ].join("\r\n");
    const preview = await previewSupplierImport({
      supplierId,
      fileName: "produtos.csv",
      fileBase64: fileBase64(file),
    });
    expect(preview.file).toEqual({
      format: "csv",
      encodingLabel: "Windows-1252",
      delimiterLabel: "vírgula",
    });
    expect(preview).toMatchObject({ totalRows: 3, validRows: 2, failedRows: 1, created: 2 });
    expect(preview.issues[0]).toMatchObject({ line: 4, sku: "A-2" });
    expect(preview.issues[0]?.issues[0]).toMatchObject({ column: "custo", columnLetter: "C" });
    expect(preview.confirmation?.content).toBe(
      "sku;titulo;custo;estoque\nA-1;Pão;12,90;1\nA-3;Arroz;5.00;2\n",
    );
    expect(preview.failedRowsCsv).toContain("A-2;Feijão;doze;1");
  });

  it("offers nothing to confirm when every row failed", async () => {
    const preview = await previewSupplierImport({
      supplierId,
      fileName: "produtos.csv",
      fileBase64: fileBase64("sku;titulo;custo;estoque\nA;B;x;1\n"),
    });
    expect(preview.confirmation).toBeNull();
    expect(mocks.preview).toHaveBeenCalledTimes(1);
  });

  it("does not ask product-csv about a file whose rows all have broken quotes", async () => {
    const preview = await previewSupplierImport({
      supplierId,
      fileName: "produtos.csv",
      fileBase64: fileBase64('sku;titulo;custo;estoque\nA;"B;1;1\n'),
    });
    expect(preview.failedRows).toBe(1);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("refuses photos without https in the supplier's spreadsheet", async () => {
    const file = [
      "sku;titulo;custo;estoque;imagens",
      "A-1;Pão;1;1;https://exemplo.com/pao.jpg",
      "A-2;Feijão;1;1;https://exemplo.com/a.jpg|http://exemplo.com/feijao.jpg",
    ].join("\n");
    const preview = await previewSupplierImport({
      supplierId,
      fileName: "produtos.csv",
      fileBase64: fileBase64(file),
    });
    expect(preview).toMatchObject({ validRows: 1, failedRows: 1 });
    expect(preview.issues[0]).toMatchObject({ line: 3, sku: "A-2" });
    expect(preview.issues[0]?.issues[0]?.message).toBe(
      'Valor inválido na coluna E, imagens (recebido: "https://exemplo.com/a.jpg|http://exemplo.com/feijao.jpg"); ' +
        "esperado: até 20 links https, separados por |.",
    );
    expect(preview.confirmation?.content).not.toContain("http://");
  });

  it("asks for a new file when the valid rows stop passing together", async () => {
    mocks.preview.mockImplementationOnce(fakePreview).mockResolvedValueOnce({
      created: 0,
      updated: 0,
      errors: [{ line: 2, reason: "x" }],
      previewToken: token,
    });
    await expect(
      previewSupplierImport({
        supplierId,
        fileName: "produtos.csv",
        fileBase64: fileBase64("sku;titulo;custo;estoque\nA;B;1;1\n"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("confirmSupplierImport", () => {
  // The rows go to review inside the shared confirmation (suppliers.server.test.ts checks it).
  it("imports through the shared confirmation, which sends the rows to review", async () => {
    const result = { created: 1, updated: 2, pausedTargets: 0, synchronizationQueued: true };
    mocks.confirm.mockResolvedValue(result);
    const input = {
      supplierId,
      content: "sku;titulo;custo;estoque\nA;B;1;1\n",
      previewToken: token,
    };
    await expect(confirmSupplierImport(input)).resolves.toEqual(result);
    expect(mocks.confirm).toHaveBeenCalledWith(input);
  });

  it("refuses to confirm rows with photos without https", async () => {
    const input = {
      supplierId,
      content: "sku;titulo;custo;estoque;imagens\nA;B;1;1;http://exemplo.com/a.jpg\n",
      previewToken: token,
    };
    await expect(confirmSupplierImport(input)).rejects.toMatchObject({
      code: "VALIDATION",
      message:
        'Link de imagem inválido (recebido: "http://exemplo.com/a.jpg"); esperado: um link que comece com https://',
    });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
