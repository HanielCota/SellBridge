import { API_SCOPE_LABELS } from "@sellbridge/shared/public-api";
import { type StatusTone, ToneStatus } from "@/components/data/tone-status";
import { SmartDate } from "@/components/data/smart-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  API_KEY_STATUS_LABELS,
  type ApiKeyStatus,
  type ApiKeyView,
  knownApiScopes,
} from "@/features/public-api/api-keys";
import { cn } from "@/lib/utils";

const STATUS_TONES: Record<ApiKeyStatus, StatusTone> = {
  active: "success",
  revoked: "muted",
  expired: "warning",
};

function ScopeBadges({ scopes }: { scopes: readonly string[] }) {
  return (
    <ul aria-label="Permissões" className="flex flex-wrap gap-1.5">
      {knownApiScopes(scopes).map((scope) => (
        <li key={scope}>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Focusable so keyboard users reach the description too. */}
              <Badge variant="secondary" tabIndex={0} className="font-mono">
                {scope}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{API_SCOPE_LABELS[scope]}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

function KeyDates({ apiKey }: { apiKey: ApiKeyView }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-footnote text-muted-foreground">
      <div className="flex gap-1">
        <dt>Criada</dt>
        <dd>
          <SmartDate date={apiKey.createdAt} />
        </dd>
      </div>
      <div className="flex gap-1">
        <dt>Último uso</dt>
        <dd>{apiKey.lastUsedAt ? <SmartDate date={apiKey.lastUsedAt} /> : "nunca usada"}</dd>
      </div>
      <div className="flex gap-1">
        <dt>Expira</dt>
        <dd>{apiKey.expiresAt ? <SmartDate date={apiKey.expiresAt} /> : "nunca"}</dd>
      </div>
    </dl>
  );
}

function ApiKeyRow({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKeyView;
  onRevoke: (apiKey: ApiKeyView) => void;
}) {
  const { status } = apiKey;
  return (
    <li
      aria-label={apiKey.name}
      className={cn(
        "flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between",
        status !== "active" && "opacity-70",
      )}
    >
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="truncate text-sm font-semibold">{apiKey.name}</h3>
          <ToneStatus tone={STATUS_TONES[status]} label={API_KEY_STATUS_LABELS[status]} />
        </div>
        <code className="text-footnote text-muted-foreground">{apiKey.prefix}…</code>
        <ScopeBadges scopes={apiKey.scopes} />
        <KeyDates apiKey={apiKey} />
      </div>
      {status === "revoked" ? null : (
        <Button
          variant="destructive"
          size="sm"
          className="self-start"
          aria-label={`Revogar a chave ${apiKey.name}`}
          onClick={() => onRevoke(apiKey)}
        >
          Revogar
        </Button>
      )}
    </li>
  );
}

/** Every key of the organization, newest first; revoked ones stay for the record. */
export function ApiKeyList({
  apiKeys,
  onRevoke,
}: {
  apiKeys: readonly ApiKeyView[];
  onRevoke: (apiKey: ApiKeyView) => void;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl bg-card ring-1 ring-border ring-inset">
      {apiKeys.map((apiKey) => (
        <ApiKeyRow key={apiKey.id} apiKey={apiKey} onRevoke={onRevoke} />
      ))}
    </ul>
  );
}
