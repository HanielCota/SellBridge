import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminActOnSellerProductFn,
  sellerActivateProductFn,
  sellerArchiveProductFn,
  sellerDuplicateProductFn,
} from "./products.functions";
import type { SellerProductEditor } from "./use-product-editor";

export type ProductCommand =
  | { kind: "duplicate"; newSku: string; newProductId: string }
  | { kind: "activate" | "archive" | "block" | "unblock" };
export interface EditorActionsOptions {
  productId: string;
  adminTenantId?: string | undefined;
  onChanged: () => Promise<void>;
  onOpen: (id: string) => void;
}

export function useEditorActions(options: EditorActionsOptions, form: SellerProductEditor) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (command: ProductCommand) => {
      if (command.kind === "duplicate") {
        const copied = await sellerDuplicateProductFn({
          data: {
            productId: options.productId,
            newProductId: command.newProductId,
            newSku: command.newSku,
          },
        });
        return { copiedId: copied.id };
      }
      if (options.adminTenantId !== undefined) {
        await adminActOnSellerProductFn({
          data: {
            tenantId: options.adminTenantId,
            productId: options.productId,
            reason: form.reason,
            action: command.kind,
          },
        });
        return { copiedId: null };
      }
      if (command.kind === "activate")
        await sellerActivateProductFn({ data: { productId: options.productId } });
      if (command.kind === "archive")
        await sellerArchiveProductFn({ data: { productId: options.productId } });
      return { copiedId: null };
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["seller-products", "list"] });
      await client.invalidateQueries({ queryKey: ["admin-catalog"] });
      if (result.copiedId === null) {
        await options.onChanged();
        return;
      }
      options.onOpen(result.copiedId);
    },
  });
}
export type EditorActions = ReturnType<typeof useEditorActions>;
