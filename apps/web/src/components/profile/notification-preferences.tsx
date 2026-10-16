import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  PREFERENCE_CHANNEL_LABELS,
  PREFERENCE_CHANNELS,
  type PreferenceChannel,
  type PreferenceRow,
} from "@/features/notifications/notification-preferences";
import { saveNotificationPreferenceFn } from "@/features/notifications/notification-preferences.functions";
import {
  notificationPreferencesQueryOptions,
  notificationsQueryOptions,
} from "@/features/notifications/notifications.queries";
import { errorMessage } from "@/lib/errors";

interface PreferenceChange {
  event: PreferenceRow["event"];
  channel: PreferenceChannel;
  enabled: boolean;
}

function withChange(rows: readonly PreferenceRow[], change: PreferenceChange): PreferenceRow[] {
  return rows.map((row) =>
    row.event === change.event
      ? {
          ...row,
          channels: {
            ...row.channels,
            [change.channel]: { ...row.channels[change.channel], enabled: change.enabled },
          },
        }
      : row,
  );
}

/** Flips the switch at once and puts it back if the save fails. */
function useSavePreference() {
  const queryClient = useQueryClient();
  const { queryKey } = notificationPreferencesQueryOptions();
  return useMutation({
    mutationFn: async (change: PreferenceChange) => saveNotificationPreferenceFn({ data: change }),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      if (previous !== undefined) {
        queryClient.setQueryData(queryKey, withChange(previous, change));
      }
      return { previous };
    },
    onError: (error, _change, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error(errorMessage(error));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey });
      // The bell hides what was turned off in the app.
      await queryClient.invalidateQueries(notificationsQueryOptions());
    },
  });
}

const CELL_WIDTH = "w-16 sm:w-20";

function PreferenceCellSwitch({
  row,
  channel,
  onChange,
}: {
  row: PreferenceRow;
  channel: PreferenceChannel;
  onChange: (change: PreferenceChange) => void;
}) {
  const cell = row.channels[channel];
  const channelLabel = PREFERENCE_CHANNEL_LABELS[channel];
  return (
    <div className={`flex shrink-0 flex-col items-center gap-1 ${CELL_WIDTH}`}>
      {/* The column header is hidden on phones; each switch says its channel there. */}
      <span className="text-caption text-muted-foreground sm:hidden" aria-hidden="true">
        {channelLabel}
      </span>
      {cell.available ? (
        <Switch
          checked={cell.enabled}
          aria-label={`${channelLabel}: ${row.label}`}
          onCheckedChange={(enabled) => onChange({ event: row.event, channel, enabled })}
        />
      ) : (
        <span className="text-sm text-muted-foreground">
          <span aria-hidden="true">—</span>
          <span className="sr-only">{`${channelLabel}: não disponível para ${row.label}`}</span>
        </span>
      )}
    </div>
  );
}

function ChannelHeader() {
  return (
    <div className="hidden items-center justify-end gap-4 pb-2 sm:flex" aria-hidden="true">
      {PREFERENCE_CHANNELS.map((channel) => (
        <span
          key={channel}
          className={`text-center text-footnote font-medium text-muted-foreground ${CELL_WIDTH}`}
        >
          {PREFERENCE_CHANNEL_LABELS[channel]}
        </span>
      ))}
    </div>
  );
}

function PreferencesSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-busy="true" aria-label="Carregando preferências">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full max-w-64" />
          </div>
          {PREFERENCE_CHANNELS.map((channel) => (
            <div key={channel} className={`flex justify-center ${CELL_WIDTH}`}>
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** Which notice reaches the person where: one row per event, one switch per channel. */
export function NotificationPreferences() {
  const query = useQuery(notificationPreferencesQueryOptions());
  const save = useSavePreference();
  if (query.isPending) {
    return <PreferencesSkeleton />;
  }
  if (query.isError) {
    return (
      <ErrorState
        message="Não foi possível carregar suas preferências."
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <div>
      <ChannelHeader />
      <ul className="divide-y divide-border">
        {query.data.map((row) => (
          <li key={row.event} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{row.label}</p>
              <p className="text-sm text-muted-foreground">{row.description}</p>
            </div>
            {PREFERENCE_CHANNELS.map((channel) => (
              <PreferenceCellSwitch
                key={channel}
                row={row}
                channel={channel}
                onChange={(change) => save.mutate(change)}
              />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
