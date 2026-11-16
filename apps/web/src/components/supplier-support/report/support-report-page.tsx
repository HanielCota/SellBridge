import {
  SUPPLIER_REPORT_DAYS,
  type SupplierReportDays,
  type SupplierSupportReport,
} from "@sellbridge/shared/supplier-support-report";
import { ChartBarIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { FilterTabs } from "@/components/data/filter-tabs";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { ReportFigures } from "@/components/supplier-support/report/report-figures";
import { SubjectsTable } from "@/components/supplier-support/report/subjects-table";
import { WaitingNowPanel } from "@/components/supplier-support/report/waiting-now-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { mySupportReportQueryOptions } from "@/features/supplier-support/supplier-support.queries";
import { errorMessage } from "@/lib/errors";

function isQuietPeriod(report: SupplierSupportReport): boolean {
  return report.received.current === 0 && report.finished.total === 0;
}

function ReportSkeleton() {
  return (
    <output className="block space-y-6" aria-label="Carregando o relatório">
      <Skeleton className="h-28 rounded-3xl" />
      <Skeleton className="h-36 rounded-3xl" />
      <Skeleton className="h-48 rounded-3xl" />
    </output>
  );
}

function PeriodBody({ report }: { report: SupplierSupportReport }) {
  if (isQuietPeriod(report)) {
    return (
      <EmptyState
        icon={ChartBarIcon}
        title={`Nenhuma conversa nos últimos ${report.days} dias`}
        description="Quando as lojas escreverem, o relatório mostra quantas chegaram e como você respondeu."
      />
    );
  }
  return (
    <>
      <ReportFigures report={report} />
      <SubjectsTable subjects={report.subjects} />
    </>
  );
}

function ReportBody({ days }: { days: SupplierReportDays }) {
  const query = useQuery(mySupportReportQueryOptions(days));
  if (query.isPending) {
    return <ReportSkeleton />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return (
    <div className="space-y-6">
      <WaitingNowPanel waiting={query.data.waiting} />
      <PeriodBody report={query.data} />
    </div>
  );
}

/** "Relatório de atendimento": how the supplier answers the stores that sell its products. */
export function SupportReportPage({
  days,
  onDaysChange,
}: {
  days: SupplierReportDays;
  onDaysChange: (days: SupplierReportDays) => void;
}) {
  return (
    <>
      <PageHeader
        title="Relatório de atendimento"
        description="Como você responde as lojas que vendem seus produtos."
        back={<BackLink to="/suporte/revendedores" label="Revendedores" />}
      />
      <FilterTabs
        legend="Período do relatório"
        value={days}
        tabs={SUPPLIER_REPORT_DAYS.map((value) => ({ value, label: `${value} dias` }))}
        onChange={onDaysChange}
      />
      <ReportBody days={days} />
    </>
  );
}
