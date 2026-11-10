import type { ErpCatalogItem } from "@sellbridge/shared/erp-catalog";
import type { BlingProductDetail, BlingProductFields } from "./schemas.ts";

/** Why a Bling product did not become an import row, shown to the supplier with its name. */
export interface SkippedBlingProduct {
  readonly name: string;
  readonly reason: string;
}

export interface BlingCatalogMapping {
  readonly items: ErpCatalogItem[];
  readonly skipped: SkippedBlingProduct[];
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function priceCents(price: number | null | undefined): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return null;
  }
  return Math.round(price * 100);
}

/** Bling weighs in kg; the package weight wins over the net weight when both are set. */
function weightGrams(fields: BlingProductFields): number | null {
  const kilograms = [fields.pesoBruto, fields.pesoLiquido].find(
    (value) => value != null && Number.isFinite(value) && value > 0,
  );
  return kilograms == null ? null : Math.round(kilograms * 1000);
}

/**
 * Only Bling's external image links: its internal ones (`midia.imagens.internas`) carry an
 * expiry date and would break in the catalog later.
 */
function imageUrls(fields: BlingProductFields): string[] {
  const links = fields.midia?.imagens?.externas ?? [];
  return links.map((image) => image.link.trim()).filter((link) => link !== "");
}

function ncmDigits(ncm: string | null | undefined): string | null {
  const digits = (ncm ?? "").replace(/\D/g, "");
  return digits === "" ? null : digits;
}

/** A variation falls back on its parent for what Bling leaves empty on it. */
function withParentDefaults(
  variation: BlingProductFields,
  parent: BlingProductFields,
): BlingProductFields {
  return {
    ...variation,
    unidade: blankToNull(variation.unidade) ?? parent.unidade,
    pesoBruto: variation.pesoBruto ?? parent.pesoBruto,
    pesoLiquido: variation.pesoLiquido ?? parent.pesoLiquido,
    marca: blankToNull(variation.marca) ?? parent.marca,
    descricaoCurta: blankToNull(variation.descricaoCurta) ?? parent.descricaoCurta,
    tributacao: {
      origem: variation.tributacao?.origem ?? parent.tributacao?.origem,
      ncm: blankToNull(variation.tributacao?.ncm) ?? parent.tributacao?.ncm,
      cest: blankToNull(variation.tributacao?.cest) ?? parent.tributacao?.cest,
    },
    midia: imageUrls(variation).length > 0 ? variation.midia : parent.midia,
  };
}

function toItem(fields: BlingProductFields): ErpCatalogItem | SkippedBlingProduct {
  const sku = blankToNull(fields.codigo);
  if (sku === null) {
    return { name: fields.nome, reason: "Sem código (SKU) no Bling" };
  }
  return {
    sku,
    title: fields.nome.trim(),
    description: blankToNull(fields.descricaoCurta) ?? "",
    priceCents: priceCents(fields.preco),
    stock: fields.estoque?.saldoVirtualTotal ?? 0,
    imageUrls: imageUrls(fields),
    brand: blankToNull(fields.marca),
    gtin: blankToNull(fields.gtin),
    weightGrams: weightGrams(fields),
    fiscal: {
      ncm: ncmDigits(fields.tributacao?.ncm),
      origin: fields.tributacao?.origem ?? null,
      unit: blankToNull(fields.unidade),
      cest: blankToNull(fields.tributacao?.cest),
    },
  };
}

/**
 * One import row per sellable item: a simple product is one row, a product with variations is
 * one row per variation (each with its own Bling code as SKU) and none for the parent.
 */
export function blingProductToItems(product: BlingProductDetail): BlingCatalogMapping {
  const variations = product.variacoes ?? [];
  const sources =
    product.formato === "V" && variations.length > 0
      ? variations.map((variation) => withParentDefaults(variation, product))
      : [product];
  const items: ErpCatalogItem[] = [];
  const skipped: SkippedBlingProduct[] = [];
  for (const source of sources) {
    if (source.situacao === "I") {
      continue;
    }
    const mapped = toItem(source);
    if ("reason" in mapped) {
      skipped.push(mapped);
      continue;
    }
    items.push(mapped);
  }
  return { items, skipped };
}
