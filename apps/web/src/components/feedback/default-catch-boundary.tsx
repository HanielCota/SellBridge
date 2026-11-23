import { ErrorComponent, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { NewVersionNotice } from "@/components/layout/new-version-notice";
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
        <h1 className="text-lg font-medium">Esta página não abriu</h1>
        <p className="text-sm text-muted-foreground">
          Toque em Tentar de novo. Se continuar, fale com o Suporte.
        </p>
      </div>
      {import.meta.env.DEV ? <ErrorComponent error={error} /> : null}
      {reportId ? (
        <p className="text-xs text-muted-foreground">
          Se for falar com o Suporte, mande este código: {reportId}
        </p>
      ) : null}
      {/* A page older than the server fails here first: the reload is the real way out. */}
      <NewVersionNotice />
      <Button onClick={() => void router.invalidate()}>Tentar de novo</Button>
    </div>
  );
}
