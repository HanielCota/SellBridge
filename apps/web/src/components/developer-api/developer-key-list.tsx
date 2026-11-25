import { DEVELOPER_SCOPE_LABELS, knownDeveloperScopes } from "@sellbridge/shared/developer-api";
import { SmartDate } from "@/components/data/smart-date";
import { type StatusTone, ToneStatus } from "@/components/data/tone-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DEVELOPER_KEY_STATUS_LABELS,
  type DeveloperKeyStatus,
  type DeveloperKeyView,
} from "@/features/developer-api/developer-keys";
import { cn } from "@/lib/utils";

const STATUS_TONES: Record<DeveloperKeyStatus, StatusTone> = {
  active: "success",
  revoked: "muted",
  expired: "warning",
};

function ScopeBadges({ scopes }: { scopes: readonly string[] }) {
  return (
    <ul aria-label="O que a chave lê" className="flex flex-wrap gap-1.5">
      {knownDeveloperScopes(scopes).map((scope) => (
        <li key={scope}>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Focusable so keyboard users reach the description too. */}
              <Badge variant="secondary" tabIndex={0} className="font-mono">
                {scope}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{DEVELOPER_SCOPE_LABELS[scope]}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

function KeyDates({ developerKey }: { developerKey: DeveloperKeyView }) {
  const { createdAt, lastUsedAt, expiresAt, revokedAt } = developerKey;
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-footnote text-muted-foreground">
      <div className="flex gap-1">
        <dt>Criada</dt>
        <dd>
          <SmartDate date={createdAt} />
        </dd>
      </div>
      <div className="flex gap-1">
        <dt>Último uso</dt>
        <dd>{lastUsedAt === null ? "nunca usada" : <SmartDate date={lastUsedAt} />}</dd>
      </div>
      {revokedAt === null ? (
        <div className="flex gap-1">
          <dt>{developerKey.status === "expired" ? "Venceu" : "Vence"}</dt>
          <dd>
            <SmartDate date={expiresAt} />
          </dd>
        </div>
      ) : (
        <div className="flex gap-1">
          <dt>Revogada</dt>
          <dd>
            <SmartDate date={revokedAt} />
          </dd>
        </div>
      )}
    </dl>
  );
}

function DeveloperKeyRow({
  developerKey,
  onRevoke,
}: {
  developerKey: DeveloperKeyView;
  onRevoke: (developerKey: DeveloperKeyView) => void;
}) {
  const { status } = developerKey;
  return (
    <li
      aria-label={developerKey.name}
      className={cn(
        "flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between",
        status !== "active" && "opacity-70",
      )}
    >
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="truncate text-sm font-semibold">{developerKey.name}</h3>
          <ToneStatus tone={STATUS_TONES[status]} label={DEVELOPER_KEY_STATUS_LABELS[status]} />
        </div>
        <code className="text-footnote text-muted-foreground">{developerKey.prefix}…</code>
        <ScopeBadges scopes={developerKey.scopes} />
        <KeyDates developerKey={developerKey} />
      </div>
      {status === "active" ? (
        <Button
          variant="destructive"
          size="sm"
          className="self-start"
          aria-label={`Revogar a chave ${developerKey.name}`}
          onClick={() => onRevoke(developerKey)}
        >
          Revogar
        </Button>
      ) : null}
    </li>
  );
}

/** The developer's own keys, newest first; revoked and expired ones stay for the record. */
export function DeveloperKeyList({
  developerKeys,
  onRevoke,
}: {
  developerKeys: readonly DeveloperKeyView[];
  onRevoke: (developerKey: DeveloperKeyView) => void;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl bg-card ring-1 ring-border ring-inset">
      {developerKeys.map((developerKey) => (
        <DeveloperKeyRow key={developerKey.id} developerKey={developerKey} onRevoke={onRevoke} />
      ))}
    </ul>
  );
}
