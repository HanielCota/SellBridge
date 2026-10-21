import { ticketBodySchema } from "@sellbridge/shared/schemas";
import { PaperPlaneRightIcon, XIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Popover } from "radix-ui";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { RecentTickets } from "@/components/support/recent-tickets";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { chatSubjectFrom } from "@/features/support/chat-subject";
import { RESPONSE_PROMISE, unreadRepliesText } from "@/features/support/response-time";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";

const createdSchema = z.object({ ticketId: z.uuid() });

/** The support pages already hold the full form and the threads. */
// The new-listing page has a publish bar along the bottom; the bubble covered its button there.
const HIDDEN_ON = ["/suporte", "/publicacoes/nova"];

function buildChatTicketFormData(message: string): FormData {
  const formData = new FormData();
  formData.set("orderId", "");
  formData.set("storeConnectionId", "");
  formData.set("listingId", "");
  // The team re-files the subject in triage; the chat only asks what happened.
  formData.set("category", "other");
  formData.set("subject", chatSubjectFrom(message));
  formData.set("body", message);
  return formData;
}

function useSendChatMessage(onSent: () => void) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(message: string): Promise<boolean> {
    const parsed = ticketBodySchema.safeParse(message);
    if (!parsed.success) {
      setError(parsed.error.issues.at(0)?.message ?? "Escreva sua mensagem");
      return false;
    }
    setError(null);
    setIsSending(true);
    try {
      const response = await postMultipart(
        "/api/suporte/chamados",
        buildChatTicketFormData(parsed.data),
      );
      const created = createdSchema.parse(response);
      toast.success("Mensagem enviada. Avisamos quando a equipe responder.");
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
      onSent();
      await navigate({ to: "/suporte/$ticketId", params: { ticketId: created.ticketId } });
      return true;
    } catch (sendError) {
      setError(errorMessage(sendError));
      return false;
    } finally {
      setIsSending(false);
    }
  }

  return { send, isSending, error };
}

function ChatComposer({ onSent }: { onSent: () => void }) {
  const [message, setMessage] = useState("");
  const { send, isSending, error } = useSendChatMessage(onSent);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sent = await send(message);
    if (!sent) {
      return;
    }
    setMessage("");
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-2">
      <label htmlFor="support-chat-message" className="sr-only">
        Sua mensagem
      </label>
      <Textarea
        id="support-chat-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, like any chat; Shift+Enter breaks the line.
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
            return;
          }
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
        placeholder="Conte o que aconteceu"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "support-chat-error" : undefined}
        disabled={isSending}
        className="max-h-40 min-h-20 resize-none"
      />
      {error ? (
        <p id="support-chat-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/suporte/novo"
          onClick={onSent}
          className="rounded-md text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Anexar arquivos
        </Link>
        <Button type="submit" size="sm" disabled={isSending}>
          <PaperPlaneRightIcon aria-hidden="true" />
          {isSending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
    </form>
  );
}

const SupportChatIcon = ACTION_ICONS.supportChat.icon;

function LauncherIcon({ open }: { open: boolean }) {
  if (open) {
    return <XIcon className="size-6" weight="bold" aria-hidden="true" />;
  }
  return <SupportChatIcon className="size-7" weight="fill" aria-hidden="true" />;
}

/**
 * A chat bubble in the corner of every page: write to the team without leaving what you were
 * doing. Each message opens a ticket, so the answer lands in "Seus chamados" like any other.
 */
export function SupportChat({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hidden = HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (hidden) {
    return null;
  }
  const close = () => setOpen(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {/* Same wrapper open or shut, so the trigger keeps its focus when the hint text changes. */}
      <Hint label={open ? "Fechar o chat" : ACTION_ICONS.supportChat.hint} openOnTap={false}>
        <Popover.Trigger
          aria-label={
            unread > 0 ? `Chat de suporte: ${unreadRepliesText(unread)}` : "Chat de suporte"
          }
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-brand text-primary-foreground shadow-lg shadow-black/25 transition-[scale] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-ring/40 active:scale-[0.94] active:duration-100 motion-reduce:active:scale-100 md:right-8 md:bottom-8"
        >
          <LauncherIcon open={open} />
          {unread > 0 && !open ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-caption font-semibold text-background tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Popover.Trigger>
      </Hint>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={12}
          aria-labelledby="support-chat-title"
          className="z-50 max-h-[calc(var(--radix-popover-content-available-height)-1rem)] w-[min(24rem,calc(100vw-2rem))] space-y-3 overflow-y-auto rounded-2xl bg-popover p-3 text-popover-foreground shadow-xl shadow-black/20 ring-1 ring-border outline-none"
        >
          <div className="space-y-0.5 px-1 pt-1">
            <h2 id="support-chat-title" className="text-base font-semibold">
              Fale com o suporte
            </h2>
            <p className="text-sm text-muted-foreground">{RESPONSE_PROMISE}.</p>
          </div>
          <ChatComposer onSent={close} />
          <RecentTickets onNavigate={close} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
