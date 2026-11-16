import { supplierSupportReportSearchSchema } from "@sellbridge/shared/schemas";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { SupportReportPage } from "@/components/supplier-support/report/support-report-page";
import { mySupportReportQueryOptions } from "@/features/supplier-support/supplier-support.queries";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/suporte/revendedores_/relatorio")({
  validateSearch: supplierSupportReportSearchSchema,
  // Only a supplier answers the stores; a store's conversations have no report.
  beforeLoad: ({ context }) => {
    if (context.session.profileKind === "seller") {
      throw redirect({ to: "/suporte/fornecedores" });
    }
  },
  loaderDeps: ({ search }) => ({ dias: search.dias }),
  loader: ({ context, deps }) =>
    prefetchOnServer(context.queryClient, mySupportReportQueryOptions(deps.dias)),
  head: () => ({ meta: [{ title: "Relatório de atendimento | Suporte | SellBridge" }] }),
  component: SupportReportRoute,
});

function SupportReportRoute() {
  const { dias } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <SupportReportPage
      days={dias}
      onDaysChange={(next) => void navigate({ search: { dias: next }, replace: true })}
    />
  );
}
