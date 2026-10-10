import { DesktopIcon, DeviceMobileIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type ActiveSession, activeSessionsQueryOptions } from "@/features/profile/account.queries";
import { describeUserAgent } from "@/features/profile/user-agent";
import { authClient } from "@/lib/auth-client";
import { formatAbsoluteTime, formatSmartDate } from "@/lib/relative-time";

function useRevoke() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries(activeSessionsQueryOptions());
  const one = useMutation({
    mutationFn: async (token: string) => {
      const result = await authClient.revokeSession({ token });
      if (result.error) {
        throw new Error("Não foi possível desconectar este dispositivo.");
      }
    },
    onSuccess: () => toast.success("Dispositivo desconectado"),
    onError: (error) => toast.error(error.message),
    onSettled: refresh,
  });
  const others = useMutation({
    mutationFn: async () => {
      const result = await authClient.revokeOtherSessions();
      if (result.error) {
        throw new Error("Não foi possível desconectar os outros dispositivos.");
      }
    },
    onSuccess: () => toast.success("Outros dispositivos desconectados"),
    onError: (error) => toast.error(error.message),
    onSettled: refresh,
  });
  return { one, others };
}

function SessionRow({
  session,
  isRevoking,
  onRevoke,
}: {
  session: ActiveSession;
  isRevoking: boolean;
  onRevoke: () => void;
}) {
  const device = describeUserAgent(session.userAgent);
  const Icon = device.isMobile ? DeviceMobileIcon : DesktopIcon;
  return (
    <li className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {device.browser} no {device.os}
          {session.isCurrent ? <Badge>Este dispositivo</Badge> : null}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {session.ipAddress ? `${session.ipAddress} · ` : null}
          {session.isCurrent ? (
            "Ativo agora"
          ) : (
            <time
              dateTime={session.updatedAt.toISOString()}
              title={formatAbsoluteTime(session.updatedAt)}
            >
              Último acesso {formatSmartDate(session.updatedAt)}
            </time>
          )}
        </p>
      </div>
      {session.isCurrent ? null : (
        <Button type="button" variant="ghost" size="sm" disabled={isRevoking} onClick={onRevoke}>
          Desconectar
        </Button>
      )}
    </li>
  );
}

/** Where the account is signed in, with a way to sign out any device you don't recognize. */
export function SessionsList() {
  const query = useQuery(activeSessionsQueryOptions());
  const revoke = useRevoke();
  if (query.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return <p className="text-sm text-destructive">{query.error.message}</p>;
  }
  const hasOthers = query.data.some((session) => !session.isCurrent);
  return (
    <div className="space-y-5">
      <ul className="divide-y divide-border">
        {query.data.map((session) => (
          <SessionRow
            key={session.token}
            session={session}
            isRevoking={revoke.one.isPending && revoke.one.variables === session.token}
            onRevoke={() => revoke.one.mutate(session.token)}
          />
        ))}
      </ul>
      {hasOthers ? (
        <Button
          type="button"
          variant="outline"
          disabled={revoke.others.isPending}
          onClick={() => revoke.others.mutate()}
        >
          {revoke.others.isPending ? "Desconectando..." : "Sair de todos os outros dispositivos"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Sua conta está aberta só neste dispositivo.</p>
      )}
    </div>
  );
}
