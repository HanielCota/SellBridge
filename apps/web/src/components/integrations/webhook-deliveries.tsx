import { WarningCircleIcon } from "@phosphor-icons/react";
import type { WebhookDeliverySummary } from "@sellbridge/database/repositories";
import { API_EVENT_LABELS, apiEventTypeSchema } from "@sellbridge/shared/public-api";
import { SmartDate } from "@/components/data/smart-date";
import { type StatusTone, ToneStatus } from "@/components/data/tone-status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  WEBHOOK_DELIVERY_STATUS_LABELS,
  type WebhookDeliveryStatus,
} from "@/features/public-api/webhooks";

const DELIVERY_TONES: Record<WebhookDeliveryStatus, StatusTone> = {
  pending: "info",
  succeeded: "success",
  failed: "danger",
};

function eventLabel(type: string): string {
  const parsed = apiEventTypeSchema.safeParse(type);
  return parsed.success ? API_EVENT_LABELS[parsed.data] : type;
}

function LastError({ message }: { message: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Último erro: ${message}`}
          className="inline-flex size-6 items-center justify-center rounded-full text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <WarningCircleIcon className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs break-words">{message}</TooltipContent>
    </Tooltip>
  );
}

function DeliveryRow({ delivery }: { delivery: WebhookDeliverySummary }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-footnote">
      <span className="min-w-0 flex-1 basis-40 truncate font-medium">
        {eventLabel(delivery.eventType)}
      </span>
      <ToneStatus
        tone={DELIVERY_TONES[delivery.status]}
        label={WEBHOOK_DELIVERY_STATUS_LABELS[delivery.status]}
      />
      <span className="text-muted-foreground tabular-nums">
        {delivery.lastStatusCode === null ? "sem resposta" : `HTTP ${delivery.lastStatusCode}`}
      </span>
      <span className="text-muted-foreground tabular-nums">
        {delivery.attempts === 1 ? "1 tentativa" : `${delivery.attempts} tentativas`}
      </span>
      <SmartDate
        date={delivery.deliveredAt ?? delivery.createdAt}
        className="text-muted-foreground"
      />
      {delivery.lastError ? <LastError message={delivery.lastError} /> : null}
    </li>
  );
}

/** The latest deliveries of one endpoint, newest first. */
export function WebhookDeliveries({
  deliveries,
}: {
  deliveries: readonly WebhookDeliverySummary[];
}) {
  return (
    <div className="grid gap-1 rounded-2xl bg-muted/40 px-4 py-3">
      <h4 className="text-footnote text-muted-foreground">Entregas recentes</h4>
      {deliveries.length === 0 ? (
        <p className="py-2 text-footnote text-muted-foreground">Nenhuma entrega ainda</p>
      ) : (
        <ul className="divide-y divide-border">
          {deliveries.map((delivery) => (
            <DeliveryRow key={delivery.id} delivery={delivery} />
          ))}
        </ul>
      )}
    </div>
  );
}
