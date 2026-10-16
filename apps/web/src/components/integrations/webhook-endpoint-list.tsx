import type {
  WebhookDeliverySummary,
  WebhookEndpointSummary,
} from "@sellbridge/database/repositories";
import { API_EVENT_LABELS, apiEventTypeSchema } from "@sellbridge/shared/public-api";
import { SmartDate } from "@/components/data/smart-date";
import { ToneStatus } from "@/components/data/tone-status";
import { WebhookDeliveries } from "@/components/integrations/webhook-deliveries";
import { Badge } from "@/components/ui/badge";
import {
  INTEGRATIONS_LOCKED_REASON,
  useIntegrationsLocked,
} from "@/components/integrations/integrations-lock";
import { Button } from "@/components/ui/button";
import { DisabledHint } from "@/components/ui/hint";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSetWebhookEndpointEnabled } from "@/features/public-api/use-set-webhook-endpoint-enabled";

export type WebhookEndpointRow = WebhookEndpointSummary & {
  recentDeliveries: WebhookDeliverySummary[];
};

function EventBadges({ eventTypes }: { eventTypes: readonly string[] }) {
  if (eventTypes.length === 0) {
    return <Badge variant="secondary">Todos os eventos</Badge>;
  }
  return (
    <ul aria-label="Eventos" className="flex flex-wrap gap-1.5">
      {eventTypes.map((type) => {
        const parsed = apiEventTypeSchema.safeParse(type);
        return (
          <li key={type}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" tabIndex={0} className="font-mono">
                  {type}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {parsed.success ? API_EVENT_LABELS[parsed.data] : type}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

function EnabledSwitch({ endpoint }: { endpoint: WebhookEndpointRow }) {
  const mutation = useSetWebhookEndpointEnabled();
  const locked = useIntegrationsLocked();
  const id = `webhook-enabled-${endpoint.id}`;
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={endpoint.disabledAt === null}
        disabled={locked || mutation.isPending}
        onCheckedChange={(enabled) => mutation.mutate({ endpointId: endpoint.id, enabled })}
      />
      <Label htmlFor={id} className="font-normal">
        Receber eventos
      </Label>
    </div>
  );
}

function EndpointRow({
  endpoint,
  onDelete,
}: {
  endpoint: WebhookEndpointRow;
  onDelete: (endpoint: WebhookEndpointRow) => void;
}) {
  const isEnabled = endpoint.disabledAt === null;
  const locked = useIntegrationsLocked();
  return (
    <li aria-label={endpoint.url} className="grid gap-4 px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="font-mono text-sm font-semibold break-all">{endpoint.url}</h3>
            <ToneStatus
              tone={isEnabled ? "success" : "muted"}
              label={isEnabled ? "Ativo" : "Desativado"}
            />
          </div>
          {endpoint.description ? (
            <p className="text-sm text-muted-foreground">{endpoint.description}</p>
          ) : null}
          <EventBadges eventTypes={endpoint.eventTypes} />
          <p className="text-footnote text-muted-foreground">
            Criado <SmartDate date={endpoint.createdAt} />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 self-start">
          <EnabledSwitch endpoint={endpoint} />
          <DisabledHint reason={locked ? INTEGRATIONS_LOCKED_REASON : undefined}>
            <Button
              variant="destructive"
              size="sm"
              disabled={locked}
              aria-label={`Excluir o webhook ${endpoint.url}`}
              onClick={() => onDelete(endpoint)}
            >
              Excluir
            </Button>
          </DisabledHint>
        </div>
      </div>
      <WebhookDeliveries deliveries={endpoint.recentDeliveries} />
    </li>
  );
}

/** Every endpoint of the organization, each with its latest deliveries. */
export function WebhookEndpointList({
  endpoints,
  onDelete,
}: {
  endpoints: readonly WebhookEndpointRow[];
  onDelete: (endpoint: WebhookEndpointRow) => void;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl bg-card ring-1 ring-border ring-inset">
      {endpoints.map((endpoint) => (
        <EndpointRow key={endpoint.id} endpoint={endpoint} onDelete={onDelete} />
      ))}
    </ul>
  );
}
