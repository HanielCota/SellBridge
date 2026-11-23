import { DesktopIcon, DeviceMobileIcon, SignOutIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { activeSessionsQueryOptions } from "@/features/profile/account.queries";
import { groupSessions, type SessionGroup } from "@/features/profile/session-groups";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime, formatSmartDate } from "@/lib/relative-time";

const GROUPS_SHOWN = 3;
/** Parallel revoke requests per batch when a group holds many sessions. */
const REVOKE_BATCH_SIZE = 10;

async function revokeTokens(tokens: readonly string[]): Promise<void> {
  for (let index = 0; index < tokens.length; index += REVOKE_BATCH_SIZE) {
    const batch = tokens.slice(index, index + REVOKE_BATCH_SIZE);
    const results = await Promise.all(batch.map((token) => authClient.revokeSession({ token })));
    if (results.some((result) => result.error)) {
      throw new Error("Este aparelho continua conectado. Toque em Desconectar de novo.");
    }
  }
}

function useRevoke() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries(activeSessionsQueryOptions());
  const group = useMutation({
    mutationFn: (target: SessionGroup) => revokeTokens(target.tokens),
    onSuccess: (_, target) =>
      toast.success(
        target.tokens.length === 1
          ? "Aparelho desconectado"
          : `${target.tokens.length} acessos desconectados`,
      ),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });
  const others = useMutation({
    mutationFn: async () => {
      const result = await authClient.revokeOtherSessions();
      if (result.error) {
        throw new Error("Os outros aparelhos continuam conectados. Toque no botão de novo.");
      }
    },
    onSuccess: () => toast.success("Outros aparelhos desconectados"),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });
  return { group, others };
}

function SessionGroupRow({
  group,
  isRevoking,
  onRevoke,
}: {
  group: SessionGroup;
  isRevoking: boolean;
  onRevoke: () => void;
}) {
  const Icon = group.device.isMobile ? DeviceMobileIcon : DesktopIcon;
  const count = group.tokens.length;
  return (
    <li className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {group.device.browser} no {group.device.os}
          {group.isCurrent ? <Badge>Este aparelho</Badge> : null}
          {count > 1 ? (
            <Badge variant="secondary" title={`${count} acessos abertos neste aparelho`}>
              {count} acessos
            </Badge>
          ) : null}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {group.ipAddress ? `${group.ipAddress} · ` : null}
          {group.isCurrent ? (
            "Ativo agora"
          ) : (
            <time
              dateTime={group.lastActiveAt.toISOString()}
              title={formatAbsoluteTime(group.lastActiveAt)}
            >
              Último acesso {formatSmartDate(group.lastActiveAt)}
            </time>
          )}
        </p>
      </div>
      {group.isCurrent ? null : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isRevoking}
          onClick={onRevoke}
          aria-label={
            count > 1
              ? `Desconectar ${count} acessos de ${group.device.browser} no ${group.device.os}`
              : undefined
          }
        >
          <SignOutIcon aria-hidden="true" />
          {isRevoking ? "Desconectando…" : "Desconectar"}
        </Button>
      )}
    </li>
  );
}

/**
 * Where the account is signed in, one row per device (identical logins are merged), with a
 * way to sign out anything you don't recognize.
 */
export function SessionsList() {
  const query = useQuery(activeSessionsQueryOptions());
  const revoke = useRevoke();
  const [isExpanded, setIsExpanded] = useState(false);
  if (query.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return <p className="text-sm text-destructive">{errorMessage(query.error)}</p>;
  }
  const groups = groupSessions(query.data);
  const visibleGroups = isExpanded ? groups : groups.slice(0, GROUPS_SHOWN);
  const hiddenCount = groups.length - visibleGroups.length;
  const hasOthers = query.data.some((session) => !session.isCurrent);
  return (
    <div className="space-y-5">
      <ul className="divide-y divide-border">
        {visibleGroups.map((group) => (
          <SessionGroupRow
            key={group.key}
            group={group}
            isRevoking={revoke.group.isPending && revoke.group.variables.key === group.key}
            onRevoke={() => revoke.group.mutate(group)}
          />
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <Button type="button" variant="link" className="px-0" onClick={() => setIsExpanded(true)}>
          Ver mais {hiddenCount} {hiddenCount === 1 ? "aparelho" : "aparelhos"}
        </Button>
      ) : null}
      {hasOthers ? (
        <Button
          type="button"
          variant="outline"
          disabled={revoke.others.isPending}
          onClick={() => revoke.others.mutate()}
        >
          {revoke.others.isPending ? "Desconectando…" : "Sair de todos os outros aparelhos"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Sua conta está aberta só neste aparelho.</p>
      )}
    </div>
  );
}
