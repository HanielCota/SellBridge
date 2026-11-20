import type { ErpCatalogItem } from "@sellbridge/shared/erp-catalog";
import { MAX_MODEL_TITLE_LENGTH } from "@sellbridge/shared/product-grid";
import type { BlingProductDetail, BlingProductFields, BlingVariation } from "./schemas.ts";
import {
  blingModelCode,
  readVariationOptions,
  type VariationOptions,
} from "./variation-options.ts";

/** Why a Bling product did not become an import row, shown to the supplier with its name. */
export interface SkippedBlingProduct {
  readonly name: string;
  readonly reason: string;
}

export interface BlingCatalogMapping {
  readonly items: ErpCatalogItem[];
  readonly skipped: SkippedBlingProduct[];
  /** Products with variations that came in one product per variation instead of as a grid. */
  readonly separated: SkippedBlingProduct[];
}

const SEPARATED_REASON =
  "As variações não são só cor e tamanho: cada uma entrou como um produto separado";

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
    erpProductId: fields.id,
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

function mapSources(sources: readonly BlingProductFields[]) {
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

/**
 * Bling's name for a variation's options: `variacao.nome`, or what its full name adds to its
 * parent's ("BABUCHE NUVEM Cor:MARINHO;Tamanho:33/34") when the answer leaves that out.
 */
function optionsName(variation: BlingVariation, parentName: string): string {
  const own = variation.variacao?.nome;
  if (own !== undefined) {
    return own;
  }
  const name = variation.nome.trim();
  const prefix = parentName.trim();
  return prefix !== "" && name.startsWith(prefix) ? name.slice(prefix.length) : "";
}

/** Each variation's colour and size, or null when one of them names anything else. */
function gridOptionsOf(
  variations: readonly BlingVariation[],
  parentName: string,
): VariationOptions[] | null {
  const options: VariationOptions[] = [];
  for (const variation of variations) {
    const read = readVariationOptions(optionsName(variation, parentName));
    if (read === null) {
      return null;
    }
    options.push(read);
  }
  return options;
}

/**
 * A "V" product's variations, each one a product of its own: in its parent's grid when every
 * active variation is named by colour and size only, separate (as before grids) otherwise.
 */
function mapVariations(product: BlingProductDetail): BlingCatalogMapping {
  const active = (product.variacoes ?? []).filter((variation) => variation.situacao !== "I");
  const options = gridOptionsOf(active, product.nome);
  const modelTitle = product.nome.trim().slice(0, MAX_MODEL_TITLE_LENGTH);
  const mapped = mapSources(active.map((variation) => withParentDefaults(variation, product)));
  if (options === null || modelTitle === "") {
    const separated = active.length > 0 ? [{ name: product.nome, reason: SEPARATED_REASON }] : [];
    return { ...mapped, separated };
  }
  const optionsBySku = new Map(
    active.flatMap((variation, index) => {
      const sku = blankToNull(variation.codigo);
      const option = options[index];
      return sku === null || option === undefined ? [] : [[sku, option] as const];
    }),
  );
  const modelCode = blingModelCode(product);
  const items = mapped.items.map((item) => {
    const option = optionsBySku.get(item.sku);
    return option === undefined ? item : { ...item, grid: { modelCode, modelTitle, ...option } };
  });
  return { items, skipped: mapped.skipped, separated: [] };
}

/**
 * One import row per sellable item: a simple product is one row, a product with variations is
 * one row per variation (each with its own Bling code as SKU and Bling id) and none for the
 * parent. Variations named by colour and size carry their grid.
 */
export function blingProductToItems(product: BlingProductDetail): BlingCatalogMapping {
  if (product.formato === "V" && (product.variacoes ?? []).length > 0) {
    return mapVariations(product);
  }
  return { ...mapSources([product]), separated: [] };
}
