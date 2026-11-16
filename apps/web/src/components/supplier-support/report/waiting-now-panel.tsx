import type { SupplierSupportReport } from "@sellbridge/shared/supplier-support-report";
import { ChatsCircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { TonePill } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import { waitingCopy } from "@/features/supplier-support/support-report-copy";

/** "Agora": what waits for the supplier, whatever the period, with the way to answer it. */
export function WaitingNowPanel({ waiting }: { waiting: SupplierSupportReport["waiting"] }) {
  const copy = waitingCopy(waiting);
  return (
    <section
      aria-labelledby="report-waiting-title"
      className="flex flex-col gap-4 rounded-3xl bg-card p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Agora</p>
        <h2 id="report-waiting-title" className="text-lg font-semibold tracking-tight">
          {copy.headline}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">{copy.detail}</p>
          {copy.late === null ? null : <TonePill tone="danger" label={copy.late} />}
        </div>
      </div>
      {waiting.count === 0 ? null : (
        <Button asChild className="h-11 sm:h-9">
          <Link to="/suporte/revendedores" search={{ status: "open" }}>
            <ChatsCircleIcon aria-hidden="true" />
            Responder agora
          </Link>
        </Button>
      )}
    </section>
  );
}
