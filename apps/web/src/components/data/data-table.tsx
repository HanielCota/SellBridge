import {
  createColumnHelper,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Every table in the app is server-driven: sorting, filtering and pagination live in
 * the URL search params and are applied by the server. No client-side features needed.
 */
export const serverTableFeatures = tableFeatures({});
export type ServerTableFeatures = typeof serverTableFeatures;

export function createServerColumnHelper<TData extends RowData>() {
  return createColumnHelper<ServerTableFeatures, TData>();
}

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<ServerTableFeatures, TData>[];
  data: TData[];
  getRowId: (row: TData) => string;
  caption: string;
  footer?: ReactNode;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  caption,
  footer,
}: DataTableProps<TData>) {
  const table = useTable({ features: serverTableFeatures, columns, data, getRowId });
  return (
    <div className="overflow-hidden rounded-3xl border bg-card dark:border-transparent">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} className="whitespace-nowrap">
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className="align-top">
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {footer ? <div className="border-t p-3">{footer}</div> : null}
    </div>
  );
}
