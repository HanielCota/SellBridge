import { ErrorComponent, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { reportRouteError } from "@/lib/report-route-error";

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [report, setReport] = useState<{ error: unknown; route: string; id: string | null } | null>(
    null,
  );
  // Route IDs are templates (e.g. $orderId), not URLs containing customer data.
  const route = router.state.matches.at(-1)?.routeId ?? "/";
  const reportId = report && report.error === error && report.route === route ? report.id : null;
  useEffect(() => {
    let active = true;
    async function recordError() {
      const id = await reportRouteError(error, route);
      if (active) setReport({ error, route, id });
    }
    void recordError();
    return () => {
      active = false;
    };
  }, [error, route]);
  return (
    <div className="flex min-h-[50svh] flex-col items-center justify-center gap-4 p-6 text-center">
      <WarningIcon className="size-10 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-lg font-medium">Algo deu errado</h1>
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar esta página. Tente novamente em instantes.
        </p>
      </div>
      {import.meta.env.DEV ? <ErrorComponent error={error} /> : null}
      {reportId ? (
        <p className="text-xs text-muted-foreground">Erro registrado. Referência: {reportId}</p>
      ) : null}
      <Button onClick={() => void router.invalidate()}>Tentar novamente</Button>
    </div>
  );
}
