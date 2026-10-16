import type { StoreConnectionSummary } from "@sellbridge/database/repositories";
import { marketplaceSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";

export const storeSchema = z.object({
  id: z.uuid(),
  marketplace: marketplaceSchema.describe("Marketplace da loja."),
  name: z.string().describe("Nome da loja no marketplace."),
  status: z
    .enum(["connected", "expired", "error"])
    .describe(
      "`connected`: funcionando; `expired`: o acesso venceu e precisa ser reconectado no SellBridge; `error`: a última tentativa de uso falhou.",
    ),
  connectedAt: z.iso.datetime().describe("Quando a loja foi conectada."),
  supplierId: z
    .uuid()
    .nullable()
    .describe(
      "O único fornecedor cujos produtos a loja vende; `null` enquanto o fornecedor não foi escolhido no SellBridge.",
    ),
});

export type StoreDto = z.input<typeof storeSchema>;

/** Public view of a store connection: never its tokens, shop id on the marketplace or errors. */
export function presentStore(store: StoreConnectionSummary): StoreDto | null {
  if (store.status === "disconnected") {
    return null;
  }
  return {
    id: store.id,
    marketplace: store.marketplace,
    name: store.shopName,
    status: store.status,
    connectedAt: store.connectedAt.toISOString(),
    supplierId: store.supplierId,
  };
}
