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
  supplierIds: z
    .array(z.uuid())
    .describe(
      "Os fornecedores cujos produtos a loja vende, do mais antigo ao mais novo; vazio enquanto nenhum fornecedor foi escolhido no SellBridge.",
    ),
  supplierId: z
    .uuid()
    .nullable()
    .describe(
      "Obsoleto: use `supplierIds`. O primeiro fornecedor da loja; `null` enquanto nenhum foi escolhido.",
    ),
});

export type StoreDto = z.input<typeof storeSchema>;

/** Public view of a store connection: never its tokens, shop id on the marketplace or errors. */
export function presentStore(store: StoreConnectionSummary): StoreDto | null {
  if (store.status === "disconnected" || store.marketplace === "mock") {
    return null;
  }
  return {
    id: store.id,
    marketplace: store.marketplace,
    name: store.shopName,
    status: store.status,
    connectedAt: store.connectedAt.toISOString(),
    supplierIds: store.supplierIds,
    supplierId: store.supplierIds[0] ?? null,
  };
}
