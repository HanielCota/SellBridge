import type { ConversationSummaryOrder } from "@sellbridge/database/repositories";
import type { TicketStatus } from "@sellbridge/shared/ticket-rules";
import { CheckCircleIcon, PackageIcon, PaperclipIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supplierOrderHref } from "@/features/supplier-support/conversation-order-link";
import { finishMyConversation } from "@/features/supplier-support/supplier-support.functions";
import { errorMessage } from "@/lib/errors";
import { useTabProfileLink } from "@/lib/tab-profile";
import { cn } from "@/lib/utils";

/** Phones get 44 px targets; the desktop table keeps the smaller buttons on one line. */
type ActionSize = "touch" | "compact";

const SIZE_CLASSES: Record<ActionSize, string> = { touch: "h-11", compact: "" };

/** "Finalizar": closes the conversation; the store writing again brings it back to "A fazer". */
export function FinishConversationButton({
  ticketId,
  size = "compact",
}: {
  ticketId: string;
  size?: ActionSize;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => finishMyConversation({ data: { ticketId } }),
    onSuccess: async () => {
      toast.success("Conversa finalizada", {
        description: "Se a loja escrever de novo, ela volta para A fazer.",
      });
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={SIZE_CLASSES[size]}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      <CheckCircleIcon aria-hidden="true" />
      {mutation.isPending ? "Finalizando…" : "Finalizar"}
    </Button>
  );
}

/** "Ver pedido": the supplier's Pedidos, on the parcel's tab and searched by the order number. */
export function SupplierOrderButton({
  order,
  size = "compact",
}: {
  order: ConversationSummaryOrder | null;
  size?: ActionSize;
}) {
  const profileLink = useTabProfileLink();
  const href = order === null ? null : supplierOrderHref(order);
  if (href === null) {
    return null;
  }
  return (
    <Button asChild variant="outline" size="sm" className={SIZE_CLASSES[size]}>
      <a href={profileLink(href)}>
        <PackageIcon aria-hidden="true" />
        Ver pedido
      </a>
    </Button>
  );
}

/** "Ver comprovante": the latest file the store sent, opened in a new tab. */
function ReceiptButton({ attachmentId, size }: { attachmentId: string | null; size: ActionSize }) {
  const profileLink = useTabProfileLink();
  if (attachmentId === null) {
    return null;
  }
  return (
    <Button asChild variant="outline" size="sm" className={SIZE_CLASSES[size]}>
      <a
        href={profileLink(`/api/suporte/anexos/${attachmentId}?inline=1`)}
        target="_blank"
        rel="noreferrer"
      >
        <PaperclipIcon aria-hidden="true" />
        Ver comprovante
      </a>
    </Button>
  );
}

/** What the supplier does from a row of its queue, without opening the conversation. */
export function SupplierConversationActions({
  conversation,
  size,
  className,
}: {
  conversation: {
    id: string;
    status: TicketStatus;
    order: ConversationSummaryOrder | null;
    latestStoreAttachmentId: string | null;
  };
  size: ActionSize;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <SupplierOrderButton order={conversation.order} size={size} />
      <ReceiptButton attachmentId={conversation.latestStoreAttachmentId} size={size} />
      {conversation.status === "closed" ? null : (
        <FinishConversationButton ticketId={conversation.id} size={size} />
      )}
    </div>
  );
}
