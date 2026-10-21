import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { NewTicketSearch } from "@sellbridge/shared/schemas";
import {
  findSupportSituation,
  findSupportTopic,
  minimumDescriptionLength,
  type SupportSituation,
  type SupportTopic,
} from "@sellbridge/shared/support-topics";
import type { TicketCategory } from "@sellbridge/shared/ticket-rules";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type ClipboardEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { filesFromClipboard } from "@/components/support/composer-parts";
import {
  selectAttachments,
  type RejectedAttachment,
} from "@/features/support/attachment-selection";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";
import { DESCRIPTION_FIELD_ID } from "./description-step";
import { focusStepHeading, STEP_HEADING_IDS } from "./step-parts";

const createdSchema = z.object({ ticketId: z.uuid() });

interface TicketDraft {
  topic: SupportTopic;
  situation: SupportSituation | undefined;
  body: string;
  files: readonly File[];
}

function buildFormData(draft: TicketDraft, search: NewTicketSearch): FormData {
  const formData = new FormData();
  formData.set("category", draft.topic.category);
  formData.set("situation", draft.situation?.id ?? "");
  formData.set("about", search.assunto ?? "");
  formData.set("body", draft.body);
  formData.set("orderId", search.pedido ?? "");
  formData.set("storeConnectionId", search.loja ?? "");
  formData.set("listingId", search.anuncio ?? "");
  for (const file of draft.files) {
    formData.append("files", file);
  }
  return formData;
}

/** Files for the ticket: kept one by one, each refused file with its own reason. */
function useTicketFiles() {
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<RejectedAttachment[]>([]);
  function addFiles(added: File[]) {
    if (added.length === 0) {
      return;
    }
    const selection = selectAttachments(files, added);
    setFiles([...files, ...selection.accepted]);
    setRejected(selection.rejected);
  }
  function removeFile(index: number) {
    setFiles(files.filter((_, position) => position !== index));
    setRejected([]);
  }
  function pasteFiles(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = filesFromClipboard(event.clipboardData);
    if (pasted.length === 0) {
      return;
    }
    event.preventDefault();
    addFiles(pasted);
  }
  return { files, rejected, addFiles, removeFile, pasteFiles };
}

/** A topic from a link only counts when this profile has it ("loja" means nothing to a supplier). */
function initialCategory(kind: ProfileKind, search: NewTicketSearch): TicketCategory | null {
  if (search.categoria === undefined) {
    return null;
  }
  return findSupportTopic(kind, search.categoria) === undefined ? null : search.categoria;
}

/**
 * Topic and situation. Changing an earlier answer clears only what depends on it, and focus moves
 * to the question that opens next.
 */
function useTicketChoices(kind: ProfileKind, search: NewTicketSearch) {
  const [category, setCategory] = useState(() => initialCategory(kind, search));
  const [situationId, setSituationId] = useState<string | undefined>(undefined);
  const topic = category === null ? undefined : findSupportTopic(kind, category);
  const situation = topic === undefined ? undefined : findSupportSituation(topic, situationId);

  function pickTopic(next: TicketCategory) {
    setCategory(next);
    setSituationId(undefined);
    const hasSituations = (findSupportTopic(kind, next)?.situations.length ?? 0) > 0;
    focusStepHeading(hasSituations ? STEP_HEADING_IDS.situation : STEP_HEADING_IDS.description);
  }
  function pickSituation(next: string) {
    setSituationId(next);
    focusStepHeading(STEP_HEADING_IDS.description);
  }
  function changeTopic() {
    setCategory(null);
    setSituationId(undefined);
    focusStepHeading(STEP_HEADING_IDS.topic);
  }
  function changeSituation() {
    setSituationId(undefined);
    focusStepHeading(STEP_HEADING_IDS.situation);
  }
  return { topic, situation, pickTopic, pickSituation, changeTopic, changeSituation };
}

/** Sends the ticket once; a failure keeps everything filled in and says what happened. */
function useSendTicket(search: NewTicketSearch) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function sendDraft(draft: TicketDraft) {
    if (isSending) {
      return;
    }
    setIsSending(true);
    setSendError(null);
    try {
      const response = await postMultipart("/api/suporte/chamados", buildFormData(draft, search));
      const created = createdSchema.parse(response);
      toast.success("Chamado enviado. Avisamos quando a equipe responder.");
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
      await navigate({ to: "/suporte/$ticketId", params: { ticketId: created.ticketId } });
    } catch (error) {
      setSendError(errorMessage(error));
      setIsSending(false);
    }
  }
  return { isSending, sendError, sendDraft };
}

/** The new-ticket flow. The text and files written so far survive any change of topic. */
export function useNewTicket(kind: ProfileKind, search: NewTicketSearch) {
  const choices = useTicketChoices(kind, search);
  const attachments = useTicketFiles();
  const sending = useSendTicket(search);
  const [body, setBody] = useState("");
  const [showTooShort, setShowTooShort] = useState(false);
  const { topic, situation } = choices;
  const needsSituation = topic !== undefined && topic.situations.length > 0;
  const isReadyToWrite = topic !== undefined && (!needsSituation || situation !== undefined);

  function writeBody(next: string) {
    setBody(next);
    setShowTooShort(false);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (topic === undefined || !isReadyToWrite) {
      return;
    }
    if (body.trim().length < minimumDescriptionLength(situation)) {
      setShowTooShort(true);
      document.getElementById(DESCRIPTION_FIELD_ID)?.focus();
      return;
    }
    await sending.sendDraft({ topic, situation, body, files: attachments.files });
  }

  return {
    ...choices,
    ...sending,
    attachments,
    needsSituation,
    isReadyToWrite,
    body,
    showTooShort,
    writeBody,
    send,
  };
}
