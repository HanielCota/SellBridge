import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { PackageIcon } from "@phosphor-icons/react";
import { useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { CustomerTicketHeader } from "@/components/support/customer-ticket-header";
import { OrderLinkPicker } from "@/components/support/order-link-picker";
import { ReplyForm, type ReplyComposerHandle } from "@/components/support/reply-form";
import { ResolvedPrompt } from "@/components/support/resolved-prompt";
import { RatingStars, TicketRatingForm } from "@/components/support/ticket-rating";
import { TicketThread } from "@/components/support/ticket-thread";
import { IconAction } from "@/components/support/composer-parts";
import { Skeleton } from "@/components/ui/skeleton";
import type { CustomerTicketFacts } from "@/features/support/customer-ticket-state";
import { type getMyTicket, markMyTicketRead } from "@/features/support/support.functions";
import { myTicketQueryOptions } from "@/features/support/support.queries";
import { useMarkTicketRead } from "@/features/support/use-mark-ticket-read";
import { useCloseWithUndo, useNotSolved } from "@/features/support/use-ticket-verdict";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/suporte/$ticketId")({
  loader: ({ context, params }) =>
    prefetchOnServer(context.queryClient, myTicketQueryOptions(params.ticketId)),
  head: () => ({ meta: [{ title: "Chamado | SellBridge" }] }),
  component: TicketPage,
});

type TicketDetail = Awaited<ReturnType<typeof getMyTicket>>;
type ThreadMessage = TicketDetail["messages"][number];

function TicketPage() {
  const { ticketId } = Route.useParams();
  const query = useQuery(myTicketQueryOptions(ticketId));
  useMarkTicketRead(ticketId, query.data?.messages.at(-1)?.id, markMyTicketRead);

  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Skeleton className="h-96 rounded-3xl" aria-label="Carregando chamado" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <TicketView detail={query.data} />;
}

/** After the thread, once the ticket is closed: the rating, or the one already given. */
function TicketRating({ ticket }: { ticket: TicketDetail["ticket"] }) {
  if (ticket.status !== "closed") {
    return null;
  }
  if (ticket.rating !== null) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Você avaliou este atendimento: <RatingStars rating={ticket.rating} />
      </p>
    );
  }
  return <TicketRatingForm ticketId={ticket.id} />;
}

/** The latest public support answer, which gets the "did this solve it?" prompt. */
function lastSupportAnswerId(detail: TicketDetail): string | null {
  const last = detail.messages.at(-1);
  if (detail.ticket.status !== "answered" || !last?.isAdmin) {
    return null;
  }
  return last.id;
}

/** The page's state line needs a few facts the thread loader already has. */
function ticketFacts(detail: TicketDetail): CustomerTicketFacts {
  const { ticket } = detail;
  const lastClose = detail.events.findLast(
    (event) => event.type === "status_changed" && event.toValue === "closed",
  );
  return {
    status: ticket.status,
    priority: ticket.priority,
    awaitingSince: ticket.awaitingSince,
    updatedAt: ticket.updatedAt,
    closedAutomatically: lastClose?.automatic === true,
    emailsOn: detail.notifyMe,
  };
}

const PLACEHOLDERS: Record<TicketDetail["ticket"]["status"], string> = {
  open: "Quer acrescentar algo? Escreva aqui…",
  answered: "Escreva sua resposta…",
  closed: "Escreva aqui para reabrir o chamado…",
};
const AFTER_NOT_SOLVED_PLACEHOLDER = "Conte o que ainda falta resolver (opcional)…";

function TicketComposer({
  ticket,
  composerRef,
  placeholder,
}: {
  ticket: TicketDetail["ticket"];
  composerRef: RefObject<ReplyComposerHandle | null>;
  placeholder: string;
}) {
  const queryClient = useQueryClient();
  return (
    <ReplyForm
      endpoint={`/api/suporte/chamados/${ticket.id}/mensagens`}
      isClosed={ticket.status === "closed"}
      draftKey={ticket.id}
      composerRef={composerRef}
      placeholder={placeholder}
      tools={
        <OrderLinkPicker
          ticketId={ticket.id}
          trigger={
            <IconAction label="Vincular um pedido ao chamado">
              <PackageIcon aria-hidden="true" />
            </IconAction>
          }
        />
      }
      onSent={async () => {
        toast.success("Mensagem enviada");
        await queryClient.invalidateQueries({ queryKey: ["tickets"] });
      }}
    />
  );
}

function TicketView({ detail }: { detail: TicketDetail }) {
  const { ticket, messages } = detail;
  const composer = useRef<ReplyComposerHandle>(null);
  const [askedForDetails, setAskedForDetails] = useState(false);
  const closeTicket = useCloseWithUndo(ticket.id);
  const notSolved = useNotSolved(ticket.id, () => {
    setAskedForDetails(true);
    composer.current?.focus();
  });
  const promptOn = lastSupportAnswerId(detail);
  const placeholder = askedForDetails ? AFTER_NOT_SOLVED_PLACEHOLDER : PLACEHOLDERS[ticket.status];

  function footerFor(message: ThreadMessage) {
    if (message.id !== promptOn) {
      return null;
    }
    return (
      <ResolvedPrompt
        isBusy={closeTicket.isBusy || notSolved.isPending}
        onSolved={closeTicket.schedule}
        onNotSolved={() => notSolved.mutate()}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <BackLink to="/suporte" label="Suporte" />
      <CustomerTicketHeader
        ticket={ticket}
        facts={ticketFacts(detail)}
        subject={detail.subject}
        orders={detail.orders}
        followers={detail.followers}
        notifyMe={detail.notifyMe}
      />
      <TicketThread
        messages={messages}
        events={detail.events}
        seenAt={detail.seenByOtherSideAt}
        messageFooter={footerFor}
      />
      <TicketRating ticket={ticket} />
      <TicketComposer ticket={ticket} composerRef={composer} placeholder={placeholder} />
    </div>
  );
}
