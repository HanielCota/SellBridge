import type { FichaField, MercadoLivreCategory } from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import { mercadoLivreCatalog } from "@/lib/server/marketplaces";

/** A category's sheet changes rarely; suggestions too. Bounded so the cache never grows. */
const CACHE_TTL_IN_MS = 6 * 60 * 60 * 1000;
const MAX_CACHED_ANSWERS = 300;

interface CachedAnswer<TValue> {
  readonly expiresAt: number;
  readonly value: TValue;
}

/**
 * Mercado Livre's answers kept for a while, the oldest dropped first when full. A failed read is
 * not kept and becomes null: the form keeps working without the sheet.
 */
function createLookup<TValue>(lookup: string, read: (key: string) => Promise<TValue>) {
  const answers = new Map<string, CachedAnswer<TValue>>();
  return async (key: string): Promise<TValue | null> => {
    const now = Date.now();
    const cached = answers.get(key);
    if (cached !== undefined && cached.expiresAt > now) {
      return cached.value;
    }
    try {
      const value = await read(key);
      if (answers.size >= MAX_CACHED_ANSWERS) {
        const oldest = answers.keys().next();
        if (oldest.done !== true) {
          answers.delete(oldest.value);
        }
      }
      answers.set(key, { expiresAt: now + CACHE_TTL_IN_MS, value });
      return value;
    } catch (error) {
      logger.warn("supplier_panel.mercado_livre_lookup_failed", { lookup, error });
      return null;
    }
  };
}

const suggestions = createLookup<readonly MercadoLivreCategory[]>(
  "categories",
  async (title) => await mercadoLivreCatalog.suggestCategories(title),
);

const fields = createLookup<readonly FichaField[]>(
  "fields",
  async (categoryId) => await mercadoLivreCatalog.categoryFields(categoryId),
);

export async function suggestMercadoLivreCategories(
  title: string,
): Promise<readonly MercadoLivreCategory[] | null> {
  return await suggestions(title.trim().toLowerCase());
}

export async function mercadoLivreCategoryFields(
  categoryId: string,
): Promise<readonly FichaField[] | null> {
  return await fields(categoryId);
}
