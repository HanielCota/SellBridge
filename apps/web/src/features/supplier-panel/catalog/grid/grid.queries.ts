import { queryOptions } from "@tanstack/react-query";
import { supplierPanelCatalogKey } from "../catalog.queries";
import { supplierPanelGetModelForm } from "./grid.functions";

/** Loaded once per opened form: autosave answers carry the newer versions afterwards. */
export const supplierPanelModelFormQueryOptions = (supplierId: string, modelId?: string) =>
  queryOptions({
    queryKey: [...supplierPanelCatalogKey(supplierId), "model-form", modelId ?? "new"],
    queryFn: () => supplierPanelGetModelForm({ data: { supplierId, modelId } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
