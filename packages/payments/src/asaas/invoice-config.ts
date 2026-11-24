import type {
  AsaasInvoiceService,
  AsaasInvoiceTaxes,
  AsaasMunicipalService,
} from "./subscription-invoices.ts";
import { z } from "zod";

/** A blank value in the hosting panel counts as not set. */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

/**
 * The monthly fee's service invoice (NFS-e): the fiscal values come from the accountant. Read as
 * text and checked in `invoiceServiceFrom`, so a typo leaves the invoice off with an error in the
 * logs instead of keeping the whole site down.
 */
export const invoiceEnvironmentFields = {
  ASAAS_INVOICE_SERVICE_ID: optionalText,
  ASAAS_INVOICE_SERVICE_CODE: optionalText,
  ASAAS_INVOICE_SERVICE_NAME: optionalText,
  ASAAS_INVOICE_ISS_PERCENT: optionalText,
  ASAAS_INVOICE_RETAIN_ISS: optionalText,
  ASAAS_INVOICE_PIS_PERCENT: optionalText,
  ASAAS_INVOICE_COFINS_PERCENT: optionalText,
  ASAAS_INVOICE_CSLL_PERCENT: optionalText,
  ASAAS_INVOICE_INSS_PERCENT: optionalText,
  ASAAS_INVOICE_IR_PERCENT: optionalText,
  ASAAS_INVOICE_NBS_CODE: optionalText,
  ASAAS_INVOICE_PIS_COFINS_STATUS: optionalText,
  ASAAS_INVOICE_OPERATION_PIS_PERCENT: optionalText,
  ASAAS_INVOICE_OPERATION_COFINS_PERCENT: optionalText,
};

type InvoiceKey = keyof typeof invoiceEnvironmentFields;
export type InvoiceEnvironment = { readonly [Key in InvoiceKey]?: string | undefined };

export type InvoiceServiceSetting =
  | { readonly kind: "off" }
  | { readonly kind: "invalid"; readonly problems: readonly string[] }
  | { readonly kind: "on"; readonly service: AsaasInvoiceService };

const MAX_PERCENT = 100;
const percentSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "use ponto como separador decimal, por exemplo 2.5")
  .transform(Number)
  .pipe(z.number().min(0).max(MAX_PERCENT));
const retainSchema = z.enum(["true", "false"]).transform((value) => value === "true");
const codeSchema = z.string().regex(/^[\d.]+$/, "só números e pontos");
const taxStatusSchema = z.string().regex(/^[A-Z_]+$/, "o código em maiúsculas, como no Asaas");

interface Reader {
  readonly problems: string[];
  read<Output>(key: InvoiceKey, schema: z.ZodType<Output>): Output | null;
}

function readerOf(environment: InvoiceEnvironment): Reader {
  const problems: string[] = [];
  return {
    problems,
    read(key, schema) {
      const value = environment[key];
      if (value === undefined) return null;
      const parsed = schema.safeParse(value);
      if (parsed.success) return parsed.data;
      problems.push(`${key}: ${parsed.error.issues[0]?.message ?? "valor inválido"}`);
      return null;
    },
  };
}

function municipalService(reader: Reader): AsaasMunicipalService | null {
  const id = reader.read("ASAAS_INVOICE_SERVICE_ID", z.string());
  const code = reader.read("ASAAS_INVOICE_SERVICE_CODE", codeSchema);
  const name = reader.read("ASAAS_INVOICE_SERVICE_NAME", z.string());
  if (name === null) reader.problems.push("ASAAS_INVOICE_SERVICE_NAME: obrigatória");
  if (id !== null && code !== null) {
    reader.problems.push("ASAAS_INVOICE_SERVICE_ID e _CODE: defina só um dos dois");
  }
  if (id === null && code === null) {
    reader.problems.push("ASAAS_INVOICE_SERVICE_ID ou ASAAS_INVOICE_SERVICE_CODE: obrigatória");
  }
  if (name === null) return null;
  if (id !== null) return { kind: "id", id, name };
  if (code !== null) return { kind: "code", code, name };
  return null;
}

function invoiceTaxes(reader: Reader): AsaasInvoiceTaxes | null {
  const issPercent = reader.read("ASAAS_INVOICE_ISS_PERCENT", percentSchema);
  if (issPercent === null) reader.problems.push("ASAAS_INVOICE_ISS_PERCENT: obrigatória");
  const withheld = (key: InvoiceKey) => reader.read(key, percentSchema) ?? 0;
  const taxes = {
    retainIss: reader.read("ASAAS_INVOICE_RETAIN_ISS", retainSchema) ?? false,
    issPercent: issPercent ?? 0,
    pisPercent: withheld("ASAAS_INVOICE_PIS_PERCENT"),
    cofinsPercent: withheld("ASAAS_INVOICE_COFINS_PERCENT"),
    csllPercent: withheld("ASAAS_INVOICE_CSLL_PERCENT"),
    inssPercent: withheld("ASAAS_INVOICE_INSS_PERCENT"),
    irPercent: withheld("ASAAS_INVOICE_IR_PERCENT"),
    nbsCode: reader.read("ASAAS_INVOICE_NBS_CODE", codeSchema),
    pisCofinsTaxStatus: reader.read("ASAAS_INVOICE_PIS_COFINS_STATUS", taxStatusSchema),
    operationPisPercent: reader.read("ASAAS_INVOICE_OPERATION_PIS_PERCENT", percentSchema),
    operationCofinsPercent: reader.read("ASAAS_INVOICE_OPERATION_COFINS_PERCENT", percentSchema),
  };
  return issPercent === null ? null : taxes;
}

/**
 * Whether the monthly fee gets its service invoice: off while none of the ASAAS_INVOICE_* values
 * is set (the accountant has not given them yet), invalid when some are set but they do not add
 * up, and on with the service and taxes Asaas needs.
 */
export function invoiceServiceFrom(environment: InvoiceEnvironment): InvoiceServiceSetting {
  const anySet = Object.entries(environment).some(
    ([key, value]) => Object.hasOwn(invoiceEnvironmentFields, key) && value !== undefined,
  );
  if (!anySet) return { kind: "off" };
  const reader = readerOf(environment);
  const service = municipalService(reader);
  const taxes = invoiceTaxes(reader);
  if (service === null || taxes === null || reader.problems.length > 0) {
    return { kind: "invalid", problems: reader.problems };
  }
  return { kind: "on", service: { service, taxes } };
}
