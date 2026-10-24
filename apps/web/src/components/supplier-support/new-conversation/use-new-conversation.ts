import type { ConversationOrder, ConversationStore } from "@sellbridge/database/repositories";
import type { NewSupplierConversationSearch } from "@sellbridge/shared/schemas";
import {
  findSupplierConversationTopic,
  type SupplierConversationTopicId,
} from "@sellbridge/shared/supplier-conversation-topics";
import { findSupportSituation, minimumDescriptionLength } from "@sellbridge/shared/support-topics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { DESCRIPTION_FIELD_ID } from "@/components/support/new-ticket/description-step";
import { focusStepHeading, STEP_HEADING_IDS } from "@/components/support/new-ticket/step-parts";
import { useTicketFiles } from "@/components/support/new-ticket/use-new-ticket";
import { postMultipart } from "@/features/support/upload";
import {
  myConversationOrderQueryOptions,
  myConversationStoresQueryOptions,
} from "@/features/supplier-support/supplier-support.queries";
import { errorMessage } from "@/lib/errors";

const createdSchema = z.object({ ticketId: z.uuid() });

interface ConversationDraft {
  storeConnectionId: string;
  topicId: SupplierConversationTopicId;
  situationId: string | undefined;
  orderId: string | undefined;
  body: string;
  files: readonly File[];
}

function buildFormData(draft: ConversationDraft): FormData {
  const formData = new FormData();
  formData.set("storeConnectionId", draft.storeConnectionId);
  formData.set("topic", draft.topicId);
  formData.set("situation", draft.situationId ?? "");
  formData.set("orderId", draft.orderId ?? "");
  formData.set("body", draft.body);
  for (const file of draft.files) {
    formData.append("files", file);
  }
  return formData;
}

function answeringStore(stores: readonly ConversationStore[], id: string | undefined) {
  const store = stores.find((item) => item.storeConnectionId === id);
  return store?.supplierAnswers === true ? store : undefined;
}

/**
 * The store: picked on screen, else the one the page was opened from (an order's store, or
 * `loja`). `null` means the reseller pressed "Alterar" and must pick again.
 */
function useStoreChoice(search: NewSupplierConversationSearch) {
  const stores = useQuery(myConversationStoresQueryOptions());
  const prefilledOrder = useQuery(myConversationOrderQueryOptions(search.pedido));
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const fromPage = prefilledOrder.data?.storeConnectionId ?? search.loja;
  const id = choice === undefined ? fromPage : (choice ?? undefined);
  const store = answeringStore(stores.data ?? [], id);
  const order: ConversationOrder | null =
    prefilledOrder.data?.storeConnectionId === store?.storeConnectionId
      ? (prefilledOrder.data ?? null)
      : null;
  return { stores, store, prefilledOrder: order, setChoice };
}

/** Sends once; a failure keeps everything filled in and says what happened. */
function useSendConversation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function sendDraft(draft: ConversationDraft) {
    if (isSending) {
      return;
    }
    setIsSending(true);
    setSendError(null);
    try {
      const response = await postMultipart("/api/suporte/conversas", buildFormData(draft));
      const created = createdSchema.parse(response);
      toast.success("Mensagem enviada. Avisamos quando o fornecedor responder.");
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
      await navigate({
        to: "/suporte/conversas/$ticketId",
        params: { ticketId: created.ticketId },
      });
    } catch (error) {
      setSendError(errorMessage(error));
      setIsSending(false);
    }
  }
  return { isSending, sendError, sendDraft };
}

/** Topic and situation, cleared step by step as earlier answers change. */
function useTopicChoice() {
  const [topicId, setTopicId] = useState<SupplierConversationTopicId | undefined>(undefined);
  const [situationId, setSituationId] = useState<string | undefined>(undefined);
  const topic = findSupplierConversationTopic(topicId);
  const situation = topic === undefined ? undefined : findSupportSituation(topic, situationId);
  function pickTopic(next: SupplierConversationTopicId) {
    setTopicId(next);
    setSituationId(undefined);
    const hasSituations = (findSupplierConversationTopic(next)?.situations.length ?? 0) > 0;
    focusStepHeading(hasSituations ? STEP_HEADING_IDS.situation : STEP_HEADING_IDS.description);
  }
  function pickSituation(next: string | undefined) {
    setSituationId(next);
    focusStepHeading(
      next === undefined ? STEP_HEADING_IDS.situation : STEP_HEADING_IDS.description,
    );
  }
  function changeTopic() {
    setTopicId(undefined);
    setSituationId(undefined);
    focusStepHeading(STEP_HEADING_IDS.topic);
  }
  return { topic, situation, pickTopic, pickSituation, changeTopic };
}

/** The new-conversation flow: store, topic, situation, then the message, order and photos. */
export function useNewConversation(search: NewSupplierConversationSearch) {
  const storeChoice = useStoreChoice(search);
  const topicChoice = useTopicChoice();
  const attachments = useTicketFiles();
  const sending = useSendConversation();
  const [orderChoice, setOrderChoice] = useState<string | null | undefined>(undefined);
  const [body, setBody] = useState("");
  const [showTooShort, setShowTooShort] = useState(false);
  const { store } = storeChoice;
  const { topic, situation } = topicChoice;
  const needsSituation = topic !== undefined && topic.situations.length > 0;
  const isReadyToWrite = topic !== undefined && (!needsSituation || situation !== undefined);
  const orderId =
    orderChoice === undefined ? storeChoice.prefilledOrder?.orderId : (orderChoice ?? undefined);

  function pickStore(next: string | null) {
    storeChoice.setChoice(next);
    setOrderChoice(null);
    focusStepHeading(next === null ? STEP_HEADING_IDS.store : STEP_HEADING_IDS.topic);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (store === undefined || topic === undefined || !isReadyToWrite) {
      return;
    }
    if (body.trim().length < minimumDescriptionLength(situation)) {
      setShowTooShort(true);
      document.getElementById(DESCRIPTION_FIELD_ID)?.focus();
      return;
    }
    await sending.sendDraft({
      storeConnectionId: store.storeConnectionId,
      topicId: topic.id,
      situationId: situation?.id,
      orderId,
      body,
      files: attachments.files,
    });
  }

  return {
    ...storeChoice,
    ...topicChoice,
    ...sending,
    attachments,
    needsSituation,
    isReadyToWrite,
    totalSteps: needsSituation || topic === undefined ? 4 : 3,
    orderId,
    pickOrder: (next: string | undefined) => setOrderChoice(next ?? null),
    pickStore,
    body,
    showTooShort,
    writeBody: (next: string) => {
      setBody(next);
      setShowTooShort(false);
    },
    send,
  };
}
