import {
  createColumnHelper,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { Fragment, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Every table in the app is server-driven: sorting, filtering and pagination live in
 * the URL search params and are applied by the server. No client-side features needed.
 */
const serverTableFeatures = tableFeatures({});
type ServerTableFeatures = typeof serverTableFeatures;

export function createServerColumnHelper<TData extends RowData>() {
  return createColumnHelper<ServerTableFeatures, TData>();
}

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<ServerTableFeatures, TData>[];
  data: TData[];
  getRowId: (row: TData) => string;
  caption: string;
  footer?: ReactNode;
  /**
   * How one row reads on a phone. When given, phones get a list of these cards and the
   * table is kept for wider screens, so no column is ever cut off.
   */
  renderMobileRow?: (row: TData) => ReactNode;
  /**
   * Content that opens under a row on wider screens, spanning every column (e.g. a quick
   * view). Return null for rows that are closed.
   */
  renderRowDetail?: (row: TData) => ReactNode;
  /**
   * Keeps the last column (the row's action) stuck to the right edge while the rest scrolls
   * sideways, so the action never hides past the edge of a narrow window.
   */
  pinLastColumn?: boolean;
}

/** The pinned column paints over what scrolls under it, with a hairline to separate them. */
const PINNED_COLUMN_CLASSES = "sticky right-0 z-10 bg-card shadow-[inset_1px_0_0_var(--border)]";

function pinnedClass(pinLastColumn: boolean, index: number, count: number): string | undefined {
  return pinLastColumn && index === count - 1 ? PINNED_COLUMN_CLASSES : undefined;
}

/** The opened row's content, under it and across every column. */
function DetailRow({ columnCount, children }: { columnCount: number; children: ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={columnCount}
        className="px-3 pt-0 pb-3 whitespace-normal first:pl-3 last:pr-3"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

function MobileRows<TData extends RowData>({
  data,
  caption,
  getRowId,
  renderMobileRow,
}: Pick<DataTableProps<TData>, "data" | "caption" | "getRowId"> & {
  renderMobileRow: (row: TData) => ReactNode;
}) {
  return (
    <ul aria-label={caption} className="divide-y divide-border md:hidden">
      {data.map((row) => (
        <li key={getRowId(row)} className="p-4">
          {renderMobileRow(row)}
        </li>
      ))}
    </ul>
  );
}

type ServerTable<TData extends RowData> = ReturnType<typeof useTable<ServerTableFeatures, TData>>;

function HeaderRows<TData extends RowData>({
  table,
  pinLastColumn,
}: {
  table: ServerTable<TData>;
  pinLastColumn: boolean;
}) {
  return (
    <TableHeader>
      {table.getHeaderGroups().map((group) => (
        <TableRow key={group.id}>
          {group.headers.map((header, index) => (
            <TableHead
              key={header.id}
              className={cn(
                "whitespace-nowrap",
                pinnedClass(pinLastColumn, index, group.headers.length),
              )}
            >
              {header.isPlaceholder ? null : <table.FlexRender header={header} />}
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  );
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  caption,
  footer,
  renderMobileRow,
  renderRowDetail,
  pinLastColumn = false,
}: DataTableProps<TData>) {
  const table = useTable({ features: serverTableFeatures, columns, data, getRowId });
  return (
    <div className="surface-card overflow-hidden rounded-3xl bg-card">
      {renderMobileRow ? (
        <MobileRows
          data={data}
          caption={caption}
          getRowId={getRowId}
          renderMobileRow={renderMobileRow}
        />
      ) : null}
      <Table className={renderMobileRow ? "max-md:hidden" : undefined}>
        <caption className="sr-only">{caption}</caption>
        <HeaderRows table={table} pinLastColumn={pinLastColumn} />
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const detail = renderRowDetail?.(row.original) ?? null;
            return (
              <Fragment key={row.id}>
                <TableRow className={detail ? "border-b-0" : undefined}>
                  {row.getAllCells().map((cell, index, cells) => (
                    <TableCell
                      key={cell.id}
                      className={pinnedClass(pinLastColumn, index, cells.length)}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
                {detail ? <DetailRow columnCount={columns.length}>{detail}</DetailRow> : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      {footer ? <div className="border-t px-6 py-3">{footer}</div> : null}
    </div>
  );
}
