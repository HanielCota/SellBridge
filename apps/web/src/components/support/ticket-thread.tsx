import type { TicketThread as TicketThreadData } from "@sellbridge/db/repositories";
import { FileText, Headset, User } from "lucide-react";
import { formatBytes } from "@/components/support/attachment-input";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function TicketThread({ messages }: { messages: TicketThreadData["messages"] }) {
  return (
    <ol className="space-y-4" aria-label="Mensagens do chamado">
      {messages.map((message) => (
        <li key={message.id} className={cn("flex gap-3", message.isAdmin && "flex-row-reverse")}>
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              message.isAdmin ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
            aria-hidden="true"
          >
            {message.isAdmin ? <Headset className="size-4" /> : <User className="size-4" />}
          </span>
          <article
            className={cn(
              "max-w-[min(42rem,85%)] space-y-2 rounded-xl border p-3",
              message.isAdmin && "border-primary/30 bg-primary/5",
            )}
          >
            <header className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {message.isAdmin ? `${message.authorName} · Suporte` : message.authorName}
              </span>
              <time dateTime={message.createdAt.toISOString()}>
                {dateFormatter.format(message.createdAt)}
              </time>
            </header>
            <p className="text-sm whitespace-pre-wrap">{message.body}</p>
            {message.attachments.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {message.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <a
                      href={`/api/suporte/anexos/${attachment.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
                    >
                      <FileText className="size-3.5" aria-hidden="true" />
                      {attachment.fileName}
                      <span className="text-muted-foreground">
                        ({formatBytes(attachment.sizeBytes)})
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        </li>
      ))}
    </ol>
  );
}
