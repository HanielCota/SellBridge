import { createContext, use } from "react";
import type { SupplierOrderRow } from "@/features/supplier-panel/orders/use-order-actions";

/** What every row needs from the inbox: the clock, the selection and the two ways to act. */
export interface QueueRowContext {
  now: Date;
  selectable: boolean;
  selectedIds: ReadonlySet<string>;
  pendingId: string | null;
  onToggle: (row: SupplierOrderRow) => void;
  onToggleAll: (rows: readonly SupplierOrderRow[], checked: boolean) => void;
  onAdvance: (row: SupplierOrderRow) => void;
  onOpen: (row: SupplierOrderRow) => void;
}

/**
 * Handed to the table cells through context, not through the column definitions: TanStack's
 * `FlexRender` mounts each `cell` function as a component, so a column rebuilt every render
 * remounted every cell and a click landing mid-remount was lost or hit another row.
 */
export const QueueRowContextValue = createContext<QueueRowContext | null>(null);

export function useQueueRow(): QueueRowContext {
  const context = use(QueueRowContextValue);
  if (context === null) {
    throw new Error("useQueueRow precisa estar dentro de OrderQueueTable");
  }
  return context;
}
