import type { ImportIssue, ImportRowIssues } from "@sellbridge/shared/supplier-panel-import-issues";
import { Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Every failed row once, with each of its problems on its own line: the column (letter as in
 * Excel, plus its name) is highlighted, then what was received and what the column expects.
 */

/** The usual problem goes without saying; the column and expected format explain it. */
const GENERIC_PROBLEM = "Valor inválido";

function ColumnChip({ issue }: { issue: ImportIssue }) {
  if (issue.column === null) {
    return <span className="text-footnote text-muted-foreground">Linha inteira</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2 py-0.5 text-footnote font-medium whitespace-nowrap text-destructive">
      {issue.columnLetter === null ? null : (
        <span className="font-semibold tabular-nums">{issue.columnLetter}</span>
      )}
      <span className="font-mono">{issue.column}</span>
    </span>
  );
}

function ReceivedValue({ issue }: { issue: ImportIssue }) {
  if (issue.received === null) {
    return null;
  }
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-footnote break-all">
      {issue.received}
    </code>
  );
}

function IssueDetail({ issue }: { issue: ImportIssue }) {
  if (issue.expected === null) {
    return <span>{issue.message}</span>;
  }
  return (
    <span className="grid gap-0.5">
      {issue.problem === GENERIC_PROBLEM ? null : (
        <span className="font-medium text-foreground">{issue.problem}</span>
      )}
      <span className="text-muted-foreground">{issue.expected}</span>
    </span>
  );
}

function DesktopTable({ rows }: { rows: readonly ImportRowIssues[] }) {
  return (
    <Table className="max-md:hidden">
      <caption className="sr-only">Linhas com erro, agrupadas por linha da planilha</caption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Linha</TableHead>
          <TableHead className="w-44">SKU</TableHead>
          <TableHead className="w-40">Coluna</TableHead>
          <TableHead className="w-48">Recebido</TableHead>
          <TableHead>Esperado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <Fragment key={row.line}>
            {row.issues.map((issue, index) => (
              <TableRow key={`${row.line}-${index}`} className="align-top hover:bg-transparent">
                {index === 0 ? (
                  <>
                    <TableCell rowSpan={row.issues.length} className="font-medium tabular-nums">
                      {row.line}
                    </TableCell>
                    <TableCell
                      rowSpan={row.issues.length}
                      className="max-w-44 truncate font-mono text-footnote"
                    >
                      {row.sku ?? "—"}
                    </TableCell>
                  </>
                ) : null}
                <TableCell>
                  <ColumnChip issue={issue} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <ReceivedValue issue={issue} />
                </TableCell>
                <TableCell className="text-sm whitespace-normal">
                  <IssueDetail issue={issue} />
                </TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

function MobileList({ rows }: { rows: readonly ImportRowIssues[] }) {
  return (
    <ul aria-label="Linhas com erro" className="divide-y divide-border md:hidden">
      {rows.map((row) => (
        <li key={row.line} className="space-y-3 p-4">
          <p className="flex items-baseline justify-between gap-3">
            <span className="font-medium">Linha {row.line}</span>
            <span className="truncate font-mono text-footnote text-muted-foreground">
              {row.sku ?? "sem SKU"}
            </span>
          </p>
          <ul className="space-y-3">
            {row.issues.map((issue, index) => (
              <li key={index} className="space-y-1.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <ColumnChip issue={issue} />
                  <ReceivedValue issue={issue} />
                </div>
                <IssueDetail issue={issue} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function ImportIssueList({ rows }: { rows: readonly ImportRowIssues[] }) {
  return (
    <div className="surface-card overflow-hidden rounded-3xl bg-card">
      <DesktopTable rows={rows} />
      <MobileList rows={rows} />
    </div>
  );
}
