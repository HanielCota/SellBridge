import { useState } from "react";

/** Checkbox state for a group of rows: none, all, or some of them selected. */
export type GroupSelectionState = boolean | "indeterminate";

export function groupSelectionState(selectedCount: number, total: number): GroupSelectionState {
  if (selectedCount === 0) {
    return false;
  }
  return selectedCount === total ? true : "indeterminate";
}

export interface Selection<TItem> {
  readonly selected: ReadonlyMap<string, TItem>;
  isSelected: (id: string) => boolean;
  toggle: (item: TItem, checked: boolean) => void;
  toggleAll: (items: readonly TItem[], checked: boolean) => void;
  stateOf: (items: readonly TItem[]) => GroupSelectionState;
  clear: () => void;
}

/**
 * Items picked across pages for a bulk action, keyed by id. With a `limit`, checking more
 * items than allowed is ignored so the bulk request never exceeds what the server accepts.
 */
export function useSelection<TItem>(
  getId: (item: TItem) => string,
  options: { limit?: number } = {},
): Selection<TItem> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const [selected, setSelected] = useState<ReadonlyMap<string, TItem>>(new Map());

  function update(items: readonly TItem[], checked: boolean) {
    setSelected((previous) => {
      const next = new Map(previous);
      for (const item of items) {
        if (checked && next.size < limit) {
          next.set(getId(item), item);
        }
        if (!checked) {
          next.delete(getId(item));
        }
      }
      return next;
    });
  }

  return {
    selected,
    isSelected: (id) => selected.has(id),
    toggle: (item, checked) => update([item], checked),
    toggleAll: update,
    stateOf: (items) =>
      groupSelectionState(items.filter((item) => selected.has(getId(item))).length, items.length),
    clear: () => setSelected(new Map()),
  };
}
