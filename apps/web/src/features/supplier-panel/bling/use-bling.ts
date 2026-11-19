import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type BlingOverview, isBlingExportRunning } from "./bling-overview";
import {
  supplierBlingDisconnect,
  supplierBlingDiscardRead,
  supplierBlingImport,
  supplierBlingOverview,
  supplierBlingReadRows,
  supplierBlingSendCatalog,
  supplierBlingSetInvoicing,
  supplierBlingStartRead,
} from "./bling.functions";

/** While the worker reads the catalog, the page asks for its progress this often. */
const READ_POLL_IN_MS = 2000;
/** While the worker sends products to Bling, the page asks how it went this often. */
const EXPORT_POLL_IN_MS = 5000;

function overviewKey(supplierId: string) {
  return ["supplier-panel", "bling", supplierId] as const;
}

function isReading(overview: BlingOverview | undefined): boolean {
  return overview?.read?.status === "reading";
}

function pollInterval(overview: BlingOverview | undefined): number | false {
  if (isReading(overview)) {
    return READ_POLL_IN_MS;
  }
  return isBlingExportRunning(overview) ? EXPORT_POLL_IN_MS : false;
}

/** The Bling card's data, polled only while a catalog read or a send to Bling is running. */
export function useBlingOverview(supplierId: string) {
  return useQuery({
    queryKey: overviewKey(supplierId),
    queryFn: async () => await supplierBlingOverview({ data: { supplierId } }),
    refetchInterval: (query) => pollInterval(query.state.data),
  });
}

/** The actions on the card; each one refreshes the card when it is done. */
export function useBlingActions(supplierId: string) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: overviewKey(supplierId) });
  };
  const startRead = useMutation({
    mutationFn: async () => await supplierBlingStartRead({ data: { supplierId } }),
    onSuccess: (overview) => queryClient.setQueryData(overviewKey(supplierId), overview),
  });
  const sendCatalog = useMutation({
    mutationFn: async () => await supplierBlingSendCatalog({ data: { supplierId } }),
    onSuccess: refresh,
  });
  const disconnect = useMutation({
    mutationFn: async () => await supplierBlingDisconnect({ data: { supplierId } }),
    onSuccess: refresh,
  });
  const discardRead = useMutation({
    mutationFn: async () => await supplierBlingDiscardRead({ data: { supplierId } }),
    onSuccess: refresh,
  });
  const setInvoicing = useMutation({
    mutationFn: async (enabled: boolean) =>
      await supplierBlingSetInvoicing({ data: { supplierId, enabled } }),
    onSuccess: (overview) => queryClient.setQueryData(overviewKey(supplierId), overview),
  });
  return { startRead, sendCatalog, disconnect, discardRead, setInvoicing, refresh };
}

/** The products of a finished read, loaded once per read. */
export function useBlingReadRows(supplierId: string, readId: string) {
  return useQuery({
    queryKey: [...overviewKey(supplierId), "read", readId] as const,
    queryFn: async () => await supplierBlingReadRows({ data: { supplierId, readId } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useBlingImport() {
  return useMutation({ mutationFn: supplierBlingImport });
}
