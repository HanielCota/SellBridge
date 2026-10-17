/** Anything picked by id: the batch keeps the whole row to list it in the confirmation. */
interface Selectable {
  id: string;
}

/** The selection with one row toggled; a new map, the old one is left as it was. */
export function toggled<TRow extends Selectable>(selected: ReadonlyMap<string, TRow>, row: TRow) {
  const next = new Map(selected);
  if (next.has(row.id)) {
    next.delete(row.id);
    return next;
  }
  return next.set(row.id, row);
}

export function withAll<TRow extends Selectable>(
  selected: ReadonlyMap<string, TRow>,
  rows: readonly TRow[],
  checked: boolean,
) {
  const next = new Map(selected);
  for (const row of rows) {
    if (checked) {
      next.set(row.id, row);
      continue;
    }
    next.delete(row.id);
  }
  return next;
}
