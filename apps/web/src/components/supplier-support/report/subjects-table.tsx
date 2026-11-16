import type { SubjectRow } from "@sellbridge/shared/supplier-support-report";
import { SUPPLIER_CONVERSATION_TOPIC_LABELS } from "@sellbridge/shared/supplier-conversation-topics";
import { Link } from "@tanstack/react-router";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import {
  subjectCameBackText,
  subjectFirstResponseText,
} from "@/features/supplier-support/support-report-copy";

const count = new Intl.NumberFormat("pt-BR");

/** The topic's name opens the queue already narrowed to it. */
function TopicLink({ row }: { row: SubjectRow }) {
  return (
    <Link
      to="/suporte/revendedores"
      search={{ assunto: row.topic }}
      className="font-medium underline-offset-4 hover:underline"
    >
      {SUPPLIER_CONVERSATION_TOPIC_LABELS[row.topic]}
    </Link>
  );
}

function MobileSubjectRow({ row }: { row: SubjectRow }) {
  return (
    <div className="space-y-1">
      <TopicLink row={row} />
      <p className="text-xs text-muted-foreground">
        {count.format(row.received)} {row.received === 1 ? "recebida" : "recebidas"} · primeira
        resposta {subjectFirstResponseText(row.firstResponseMinutes)} · voltaram{" "}
        {subjectCameBackText(row.cameBack)}
      </p>
    </div>
  );
}

const columnHelper = createServerColumnHelper<SubjectRow>();

const COLUMNS = columnHelper.columns([
  columnHelper.accessor("topic", {
    header: "Assunto",
    cell: (info) => <TopicLink row={info.row.original} />,
  }),
  columnHelper.accessor("received", {
    header: "Recebidas",
    cell: (info) => <span className="tabular-nums">{count.format(info.getValue())}</span>,
  }),
  columnHelper.accessor("firstResponseMinutes", {
    header: "Primeira resposta",
    cell: (info) => (
      <span className="whitespace-nowrap tabular-nums">
        {subjectFirstResponseText(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("cameBack", {
    header: "Voltaram",
    cell: (info) => (
      <span className="whitespace-nowrap tabular-nums">{subjectCameBackText(info.getValue())}</span>
    ),
  }),
]);

/** One row per topic with activity in the period, the busiest first. */
export function SubjectsTable({ subjects }: { subjects: readonly SubjectRow[] }) {
  return (
    <section aria-labelledby="report-subjects-title" className="space-y-3">
      <h2 id="report-subjects-title" className="text-subhead font-medium">
        Por assunto
      </h2>
      <DataTable
        columns={COLUMNS}
        data={[...subjects]}
        getRowId={(row) => row.topic}
        caption="Conversas por assunto"
        renderMobileRow={(row) => <MobileSubjectRow row={row} />}
      />
    </section>
  );
}
