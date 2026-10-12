import type { TicketThread as TicketThreadData } from "@sellbridge/database/repositories";
import {
  FileTextIcon,
  HeadsetIcon,
  LockSimpleIcon,
  QuotesIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { formatBytes } from "@/components/support/attachment-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThreadMessage = TicketThreadData["messages"][number];

const TIME_ZONE = "America/Sao_Paulo";
const fullFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});
const sameYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});
const yearFormatter = new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: TIME_ZONE });

/** Drops the year for messages of the current year, so the header stays short. */
function formatMessageDate(date: Date): string {
  if (yearFormatter.format(date) !== yearFormatter.format(new Date())) {
    return fullFormatter.format(date);
  }
  return sameYearFormatter.format(date);
}

function authorLabel(message: ThreadMessage, tagSupport: boolean): string {
  if (message.isInternal) {
    return `Nota interna · ${message.authorName}`;
  }
  if (message.isAdmin && tagSupport) {
    return `${message.authorName} · Suporte`;
  }
  return message.authorName;
}

function AuthorAvatar({ message }: { message: ThreadMessage }) {
  let icon = <UserIcon className="size-4" />;
  let tone = "bg-muted";
  if (message.isAdmin) {
    icon = <HeadsetIcon className="size-4" />;
    tone = "bg-primary text-primary-foreground";
  }
  if (message.isInternal) {
    icon = <LockSimpleIcon className="size-4" />;
    tone = "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  }
  return (
    <span
      className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", tone)}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

function MessageAttachments({ attachments }: { attachments: ThreadMessage["attachments"] }) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <a
            href={`/api/suporte/anexos/${attachment.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs hover:bg-muted"
          >
            <FileTextIcon className="size-3.5" aria-hidden="true" />
            {attachment.fileName}
            <span className="text-muted-foreground">({formatBytes(attachment.sizeBytes)})</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * `onQuote` turns on the admin action that quotes a message into the reply. The admin view
 * drops the "Suporte" tag: there the headset avatar already tells the sides apart.
 */
export function TicketThread({
  messages,
  onQuote,
}: {
  messages: TicketThreadData["messages"];
  onQuote?: (message: ThreadMessage) => void;
}) {
  const tagSupport = onQuote === undefined;
  return (
    <ol className="space-y-4" aria-label="Mensagens do chamado">
      {messages.map((message) => (
        <li key={message.id} className={cn("flex gap-3", message.isAdmin && "flex-row-reverse")}>
          <AuthorAvatar message={message} />
          <article
            className={cn(
              "group/message max-w-[min(42rem,85%)] space-y-1.5 rounded-2xl border px-4 py-3",
              message.isAdmin && "border-primary/30 bg-primary/5",
              message.isInternal && "border-dashed border-amber-500/50 bg-amber-500/5",
            )}
          >
            <header className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {authorLabel(message, tagSupport)}
              </span>
              <time
                dateTime={message.createdAt.toISOString()}
                title={fullFormatter.format(message.createdAt)}
                suppressHydrationWarning
              >
                {formatMessageDate(message.createdAt)}
              </time>
              {onQuote && !message.isInternal ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-1.5 text-xs text-muted-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover/message:opacity-100 sm:focus-visible:opacity-100"
                  aria-label={`Citar mensagem de ${message.authorName}`}
                  onClick={() => onQuote(message)}
                >
                  <QuotesIcon aria-hidden="true" />
                  Citar
                </Button>
              ) : null}
            </header>
            <p className="text-sm whitespace-pre-wrap">{message.body}</p>
            <MessageAttachments attachments={message.attachments} />
          </article>
        </li>
      ))}
    </ol>
  );
}
