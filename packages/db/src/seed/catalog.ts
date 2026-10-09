import { count } from "drizzle-orm";
import type { Database } from "../client.ts";
import { categories, supplierCoverage, supplierProducts, suppliers } from "../schema/index.ts";
import { CATEGORIES, NICHE_PRODUCTS, SUPPLIERS, type ProductTemplate } from "./data.ts";
import type { Random } from "./random.ts";

const VARIANTS = ["Preto", "Branco", "Azul", "Bege", "Verde", "Rosa", "Cinza"];

function roundToNinety(cents: number): number {
  return Math.max(990, Math.ceil(cents / 100) * 100 - 10);
}

function buildProducts(
  random: Random,
  templates: ProductTemplate[],
  supplierIndex: number,
  categoryIds: Map<string, string>,
) {
  const products = [];
  for (const [templateIndex, template] of templates.entries()) {
    const variantCount = random.int(1, 3);
    for (let variant = 0; variant < variantCount; variant += 1) {
      const color = random.pick(VARIANTS);
      const costCents = random.int(template.cost[0], template.cost[1]);
      const markup = 1.6 + random.next() * 0.9;
      const sku = `S${String(supplierIndex + 1).padStart(2, "0")}-${String(templateIndex + 1).padStart(2, "0")}${variant}`;
      products.push({
        sku,
        title: `${template.title} - ${color}`,
        description: `${template.title} na cor ${color.toLowerCase()}. Produto a pronta entrega, enviado direto pelo fornecedor para o seu cliente.`,
        costCents,
        suggestedPriceCents: roundToNinety(costCents * markup),
        stock: random.chance(0.12) ? 0 : random.int(3, 240),
        categoryId: categoryIds.get(template.category) ?? null,
        imageUrls: [`https://picsum.photos/seed/sellbridge-${sku}/600/600`],
      });
    }
  }
  return products;
}

export async function seedCategories(db: Database): Promise<Map<string, string>> {
  await db.insert(categories).values(CATEGORIES).onConflictDoNothing({ target: categories.slug });
  const rows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  return new Map(rows.map((row) => [row.slug, row.id]));
}

/** Inserts suppliers, coverage and products only when the catalog is empty. */
export async function seedCatalog(db: Database, random: Random): Promise<{ created: boolean }> {
  const [existing] = await db.select({ total: count() }).from(suppliers);
  if (existing && existing.total > 0) {
    return { created: false };
  }
  const categoryIds = await seedCategories(db);

  for (const [supplierIndex, seedSupplier] of SUPPLIERS.entries()) {
    const [inserted] = await db
      .insert(suppliers)
      .values({
        name: seedSupplier.name,
        niche: seedSupplier.niche,
        description: seedSupplier.description,
        state: seedSupplier.state,
        city: seedSupplier.city,
        logoUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seedSupplier.name)}`,
      })
      .returning({ id: suppliers.id });
    if (!inserted) {
      throw new Error(`Falha ao inserir fornecedor ${seedSupplier.name}`);
    }
    await db.insert(supplierCoverage).values(
      seedSupplier.coverage.map((area) => ({
        supplierId: inserted.id,
        state: area.state,
        city: area.city ?? null,
      })),
    );
    const templates = NICHE_PRODUCTS[seedSupplier.niche] ?? [];
    const products = buildProducts(random, templates, supplierIndex, categoryIds);
    await db
      .insert(supplierProducts)
      .values(products.map((product) => ({ ...product, supplierId: inserted.id })));
  }
  return { created: true };
}
