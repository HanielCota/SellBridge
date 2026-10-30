import type {
  TicketEventView,
  TicketThread as TicketThreadData,
} from "@sellbridge/database/repositories";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import {
  CheckIcon,
  ChecksIcon,
  FileTextIcon,
  HeadsetIcon,
  LockSimpleIcon,
  QuotesIcon,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { formatFileSize } from "@/lib/file-size";
import {
  CUSTOMER_PERSPECTIVE,
  STAFF_PERSPECTIVE,
  type ThreadPerspective,
} from "@/components/support/thread-perspective";
import { TonePill } from "@/components/data/tone-status";
import { UserAvatar } from "@/components/layout/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { brazilDayKey, nearDayName } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { useTabProfileLink } from "@/lib/tab-profile";

type ThreadMessage = TicketThreadData["messages"][number];
type Attachment = ThreadMessage["attachments"][number];

const fullFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: REPORT_TIME_ZONE,
});
const sameYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: REPORT_TIME_ZONE,
});
const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: REPORT_TIME_ZONE,
});
const yearFormatter = new Intl.DateTimeFormat("pt-BR", {
  year: "numeric",
  timeZone: REPORT_TIME_ZONE,
});
const dayLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  timeZone: REPORT_TIME_ZONE,
});
const dayLabelWithYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: REPORT_TIME_ZONE,
});

/** Drops the year for messages of the current year, so the header stays short. */
function formatMessageDate(date: Date): string {
  if (yearFormatter.format(date) !== yearFormatter.format(new Date())) {
    return fullFormatter.format(date);
  }
  return sameYearFormatter.format(date);
}

/** "Hoje", "Ontem", "10 de outubro" — the day separators between messages, in Brasília time. */
function formatDayLabel(date: Date, now: Date = new Date()): string {
  const nearName = nearDayName(brazilDayKey(date), now);
  if (nearName !== null) {
    return nearName;
  }
  if (yearFormatter.format(date) !== yearFormatter.format(now)) {
    return dayLabelWithYearFormatter.format(date);
  }
  return dayLabelFormatter.format(date);
}

function authorLabel(message: ThreadMessage): string {
  if (message.isInternal) {
    return `Nota interna · ${message.authorName}`;
  }
  return message.authorName;
}

/** "Suporte SellBridge" on the team's replies, so they read apart from the customer's at a glance. */
function ResponderBadge({
  message,
  perspective,
}: {
  message: ThreadMessage;
  perspective: ThreadPerspective;
}) {
  if (!message.isAdmin || message.isInternal || perspective.responderBadge === null) {
    return null;
  }
  return <TonePill tone="success" showDot={false} label={perspective.responderBadge} />;
}

/** The reseller sees their own photo (or initials, as in the top bar); support keeps the headset. */
function AuthorAvatar({
  message,
  responderAvatar,
}: {
  message: ThreadMessage;
  responderAvatar: ThreadPerspective["responderAvatar"];
}) {
  const drawsPerson = responderAvatar === "initials" && !message.isInternal;
  if (!message.isAdmin || drawsPerson) {
    return (
      <UserAvatar
        name={message.authorName}
        image={message.authorImage}
        className="size-8 text-xs"
      />
    );
  }
  let icon = <HeadsetIcon className="size-4" />;
  let tone = "bg-primary text-primary-foreground";
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

/** Images and downloads are fetched by the browser itself, so the URL names the tab's profile. */
function useAttachmentUrl(): (attachment: Attachment, inline?: boolean) => string {
  const withProfile = useTabProfileLink();
  return (attachment, inline = false) => {
    const base = `/api/suporte/anexos/${attachment.id}`;
    return withProfile(inline ? `${base}?inline=1` : base);
  };
}

function isImage(attachment: Attachment): boolean {
  return attachment.mimeType.startsWith("image/");
}

/** A thumbnail whose file could not be loaded: says so and keeps the download at hand. */
function BrokenImage({ attachment }: { attachment: Attachment }) {
  const attachmentUrl = useAttachmentUrl();
  return (
    <div className="flex h-24 w-36 flex-col items-center justify-center gap-1 rounded-xl border bg-muted p-2 text-center text-xs">
      <span className="text-muted-foreground">Não foi possível carregar a imagem</span>
      <a href={attachmentUrl(attachment)} className="underline underline-offset-4">
        Baixar arquivo
      </a>
    </div>
  );
}

/** Images open large on the page; the download stays one click away. */
function ImagePreview({ attachment }: { attachment: Attachment }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const attachmentUrl = useAttachmentUrl();
  if (failed) {
    return <BrokenImage attachment={attachment} />;
  }
  return (
    <>
      <button
        type="button"
        className="group/thumb block overflow-hidden rounded-xl border bg-muted transition-[scale] duration-100 active:scale-[0.97] motion-reduce:active:scale-100"
        aria-label={`Ampliar ${attachment.fileName}`}
        onClick={() => setOpen(true)}
      >
        {/* Contained, never cropped: a tall phone print showed only its top-left corner. */}
        <img
          src={attachmentUrl(attachment, true)}
          alt=""
          loading="lazy"
          width={144}
          height={96}
          className="h-24 w-36 object-contain transition-opacity group-hover/thumb:opacity-90"
          onError={() => setFailed(true)}
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(64rem,calc(100vw-2rem))] gap-3 p-3 sm:max-w-[min(64rem,calc(100vw-2rem))]">
          <DialogTitle className="truncate px-1 text-sm">{attachment.fileName}</DialogTitle>
          <DialogDescription className="sr-only">Imagem anexada ao chamado</DialogDescription>
          <img
            src={attachmentUrl(attachment, true)}
            alt={attachment.fileName}
            className="max-h-[75dvh] w-full rounded-xl object-contain"
          />
          <a
            href={attachmentUrl(attachment)}
            className="px-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Baixar ({formatFileSize(attachment.sizeBytes)})
          </a>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MessageAttachments({ attachments }: { attachments: readonly Attachment[] }) {
  const attachmentUrl = useAttachmentUrl();
  if (attachments.length === 0) {
    return null;
  }
  const images = attachments.filter(isImage);
  const files = attachments.filter((attachment) => !isImage(attachment));
  return (
    <div className="space-y-2 pt-1">
      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {images.map((attachment) => (
            <li key={attachment.id}>
              <ImagePreview attachment={attachment} />
            </li>
          ))}
        </ul>
      ) : null}
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((attachment) => (
            <li key={attachment.id}>
              <a
                href={attachmentUrl(attachment)}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs hover:bg-muted"
              >
                <FileTextIcon className="size-3.5" aria-hidden="true" />
                {attachment.fileName}
                <span className="text-muted-foreground">
                  ({formatFileSize(attachment.sizeBytes)})
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type ThreadEntry =
  | { kind: "message"; at: Date; message: ThreadMessage }
  | { kind: "event"; at: Date; event: TicketEventView; text: string };

/** Messages and the history in one timeline; history the reader gains nothing from is dropped. */
function buildTimeline(
  messages: readonly ThreadMessage[],
  events: readonly TicketEventView[],
  describeEvent: ThreadPerspective["describeEvent"],
): ThreadEntry[] {
  const entries: ThreadEntry[] = messages.map((message) => ({
    kind: "message",
    at: message.createdAt,
    message,
  }));
  for (const event of events) {
    const text = describeEvent(event);
    if (text !== null) {
      entries.push({ kind: "event", at: event.createdAt, event, text });
    }
  }
  // A change made with a message (someone taking the ticket by answering) reads before it.
  return entries.toSorted(
    (first, second) =>
      first.at.getTime() - second.at.getTime() || kindOrder(first) - kindOrder(second),
  );
}

function kindOrder(entry: ThreadEntry): number {
  return entry.kind === "event" ? 0 : 1;
}

function DaySeparator({ date }: { date: Date }) {
  return (
    <li
      className="flex items-center gap-3 py-1 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
      suppressHydrationWarning
    >
      {formatDayLabel(date)}
    </li>
  );
}

function EventLine({ entry }: { entry: Extract<ThreadEntry, { kind: "event" }> }) {
  return (
    <li className="flex justify-center">
      <p className="max-w-[90%] text-center text-xs text-muted-foreground">
        {entry.text}
        <span className="mx-1.5" aria-hidden="true">
          ·
        </span>
        <time dateTime={entry.at.toISOString()} suppressHydrationWarning>
          {timeFormatter.format(entry.at)}
        </time>
      </p>
    </li>
  );
}

/** Under the asker's last message: whether someone from the other side opened the thread since. */
function SeenReceipt({
  seenAt,
  sentAt,
  owner,
}: {
  seenAt: Date | null;
  sentAt: Date;
  owner: string;
}) {
  if (seenAt !== null && seenAt.getTime() >= sentAt.getTime()) {
    return (
      <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <ChecksIcon className="size-3.5 text-brand-text" aria-hidden="true" />
        Visto {owner}
      </p>
    );
  }
  return (
    <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
      <CheckIcon className="size-3.5" aria-hidden="true" />
      Enviado · ainda não visto {owner}
    </p>
  );
}

/** Like any chat app: whoever is reading sees their own side on the right, tinted. */
function isReadersOwn(message: ThreadMessage, readerSide: ThreadPerspective["readerSide"]) {
  if (readerSide === "observer") {
    return false;
  }
  return readerSide === "customer" ? !message.isAdmin : message.isAdmin;
}

function MessageItem({
  message,
  perspective,
  onQuote,
  footer,
}: {
  message: ThreadMessage;
  perspective: ThreadPerspective;
  onQuote?: ((message: ThreadMessage) => void) | undefined;
  footer: ReactNode;
}) {
  const isMine = isReadersOwn(message, perspective.readerSide);
  return (
    <li className={cn("flex gap-3", isMine && "flex-row-reverse")}>
      <AuthorAvatar message={message} responderAvatar={perspective.responderAvatar} />
      <article
        className={cn(
          "group/message max-w-[min(42rem,85%)] min-w-0 space-y-1.5 rounded-2xl border px-4 py-3",
          isMine && "border-primary/30 bg-primary/5",
          message.isInternal && "border-dashed border-amber-500/50 bg-amber-500/5",
        )}
      >
        <header className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{authorLabel(message)}</span>
          <ResponderBadge message={message} perspective={perspective} />
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
              className="ml-auto h-6 px-1.5 text-xs text-muted-foreground opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/message:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
              aria-label={`Citar mensagem de ${message.authorName}`}
              onClick={() => onQuote(message)}
            >
              <QuotesIcon aria-hidden="true" />
              Citar
            </Button>
          ) : null}
        </header>
        <p className="text-sm break-words whitespace-pre-wrap">{message.body}</p>
        <MessageAttachments attachments={message.attachments} />
        {footer}
      </article>
    </li>
  );
}

/**
 * `onQuote` turns on the admin action that quotes a message into the reply. Without a
 * `perspective`, the admin view (with `onQuote`) reads as the team and every other view as the
 * customer; both show the "Suporte SellBridge" tag on team replies.
 * The reseller view also passes `events` (shown between the messages), `seenAt` (read receipt
 * under their last message) and `messageFooter` (the "did this solve it?" prompt).
 */
export function TicketThread({
  messages,
  onQuote,
  events = [],
  seenAt,
  messageFooter,
  perspective = onQuote === undefined ? CUSTOMER_PERSPECTIVE : STAFF_PERSPECTIVE,
}: {
  messages: TicketThreadData["messages"];
  onQuote?: (message: ThreadMessage) => void;
  events?: readonly TicketEventView[];
  seenAt?: Date | null;
  messageFooter?: (message: ThreadMessage) => ReactNode;
  perspective?: ThreadPerspective;
}) {
  const timeline = buildTimeline(messages, events, perspective.describeEvent);
  const lastMessage = messages.at(-1);
  const showReceipt = seenAt !== undefined && lastMessage !== undefined && !lastMessage.isAdmin;
  let previousDay = "";
  const items: ReactNode[] = [];
  for (const entry of timeline) {
    const day = brazilDayKey(entry.at);
    if (day !== previousDay) {
      items.push(<DaySeparator key={`day-${day}`} date={entry.at} />);
      previousDay = day;
    }
    if (entry.kind === "event") {
      items.push(<EventLine key={`event-${entry.event.id}`} entry={entry} />);
      continue;
    }
    items.push(
      <MessageItem
        key={entry.message.id}
        message={entry.message}
        perspective={perspective}
        onQuote={onQuote}
        footer={messageFooter?.(entry.message)}
      />,
    );
  }
  return (
    <div className="space-y-2">
      <ol className="space-y-4" aria-label="Mensagens do chamado">
        {items}
      </ol>
      {showReceipt ? (
        <SeenReceipt
          seenAt={seenAt ?? null}
          sentAt={lastMessage.createdAt}
          owner={perspective.receiptOwner}
        />
      ) : null}
    </div>
  );
}
