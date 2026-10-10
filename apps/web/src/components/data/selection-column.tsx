import type { RowData } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import type { Selection } from "@/hooks/use-selection";
import { createServerColumnHelper } from "./data-table";

/** Leading checkbox column: one box per row plus a header box for the whole page. */
export function selectionColumn<TData extends RowData>({
  selection,
  pageRows,
  getId,
  getLabel,
}: {
  selection: Selection<TData>;
  pageRows: readonly TData[];
  getId: (row: TData) => string;
  getLabel: (row: TData) => string;
}) {
  return createServerColumnHelper<TData>().display({
    id: "select",
    header: () => (
      <Checkbox
        aria-label="Selecionar todos desta página"
        checked={selection.stateOf(pageRows)}
        onCheckedChange={(checked) => selection.toggleAll(pageRows, checked === true)}
      />
    ),
    cell: (info) => {
      const row = info.row.original;
      return (
        <Checkbox
          aria-label={`Selecionar ${getLabel(row)}`}
          checked={selection.isSelected(getId(row))}
          onCheckedChange={(checked) => selection.toggle(row, checked === true)}
          className="mt-3.5"
        />
      );
    },
  });
}
