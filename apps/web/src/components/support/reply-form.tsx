import { CircleNotchIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert } from "@/components/form/form-feedback";
import {
  AttachedFiles,
  AttachmentButton,
  COMPOSER_BOX_CLASS,
  COMPOSER_TEXTAREA_CLASS,
  COMPOSER_TOOLBAR_CLASS,
  FileError,
  filesFromClipboard,
  submitOnModEnter,
  useComposerFiles,
  useFileDrop,
} from "@/components/support/composer-parts";
import { Button } from "@/components/ui/button";
import { useReplyDraft, type DraftState } from "@/features/support/reply-draft";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";

const MIN_BODY_LENGTH = 10;
const MAX_BODY_LENGTH = 5000;
/** The counter only shows up once the limit is close enough to matter. */
const COUNTER_FROM = 4000;

/** Lets the page put the cursor in the box ("Não" asks for details after telling support). */
export interface ReplyComposerHandle {
  focus: () => void;
}

interface ReplyFormProps {
  endpoint: string;
  /** A reply on a closed ticket reopens it; the form says so up front. */
  isClosed: boolean;
  onSent: () => Promise<void> | void;
  /** Keeps the unsent text in this browser, per ticket. */
  draftKey?: string | undefined;
  /** Extra actions for the toolbar, next to the attachment button. */
  tools?: ReactNode;
  composerRef?: Ref<ReplyComposerHandle>;
  /** What the box asks for; it changes with the moment of the ticket. */
  placeholder?: string;
  /** Beside the send button on a closed thread: what replying does. */
  closedHint?: string;
}

function buildReplyFormData(body: string, files: readonly File[]): FormData {
  const formData = new FormData();
  formData.set("body", body);
  for (const file of files) {
    formData.append("files", file);
  }
  return formData;
}

function useReplySubmission({
  endpoint,
  onSent,
  draftKey,
}: Pick<ReplyFormProps, "endpoint" | "onSent" | "draftKey">) {
  const draft = useReplyDraft(draftKey);
  const attachments = useComposerFiles();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  // State updates land after the next render; two quick submits would both see "not sending".
  const sendingRef = useRef(false);

  async function submit() {
    if (sendingRef.current) {
      return;
    }
    setSubmitError(null);
    if (draft.body.trim().length < MIN_BODY_LENGTH) {
      setSubmitError("Escreva ao menos 10 caracteres");
      return;
    }
    const formData = buildReplyFormData(draft.body, attachments.files);
    sendingRef.current = true;
    setIsSending(true);
    try {
      await postMultipart(endpoint, formData);
      draft.clear();
      attachments.clear();
      await onSent();
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }

  return { draft, attachments, submitError, setSubmitError, isSending, submit };
}

const DRAFT_LABELS: Record<DraftState, string> = {
  empty: "",
  saving: "Salvando rascunho…",
  saved: "Rascunho salvo",
};

function ComposerStatus({ draft, length }: { draft: DraftState; length: number }) {
  const showCounter = length >= COUNTER_FROM;
  return (
    <span className="ml-auto flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <span className="truncate" aria-live="polite">
        {DRAFT_LABELS[draft]}
      </span>
      {showCounter ? (
        <span className={cn("tabular-nums", length > MAX_BODY_LENGTH && "text-destructive")}>
          {length.toLocaleString("pt-BR")}/{MAX_BODY_LENGTH.toLocaleString("pt-BR")}
        </span>
      ) : null}
    </span>
  );
}

function DropOverlay({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-3xl bg-background/80 text-sm font-medium">
      <UploadSimpleIcon className="size-5" aria-hidden="true" />
      Solte para anexar
    </div>
  );
}

/** Text box and the handle the page uses to put the cursor in it. */
function useComposerText(composerRef: Ref<ReplyComposerHandle> | undefined) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function focusAtEnd() {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  useImperativeHandle(composerRef, () => ({ focus: focusAtEnd }));

  return { textareaRef };
}

/** Reseller reply: the same single-box composer the support team uses, without its tools. */
export function ReplyForm({
  endpoint,
  isClosed,
  onSent,
  draftKey,
  tools,
  composerRef,
  placeholder = "Escreva sua resposta para o suporte…",
  closedHint = "Responder reabre o chamado",
}: ReplyFormProps) {
  const reply = useReplySubmission({ endpoint, onSent, draftKey });
  const { textareaRef } = useComposerText(composerRef);
  const formRef = useRef<HTMLFormElement>(null);
  const drop = useFileDrop(reply.attachments.addFiles);

  return (
    <div className="space-y-2 print:hidden">
      <form
        ref={formRef}
        noValidate
        className={cn(
          COMPOSER_BOX_CLASS,
          "relative",
          drop.isOver && "border-brand-strong bg-brand/5",
        )}
        onSubmit={submitHandler(reply.submit)}
        {...drop.handlers}
      >
        <textarea
          ref={textareaRef}
          id="reply-body"
          aria-label="Sua resposta"
          rows={3}
          maxLength={MAX_BODY_LENGTH}
          placeholder={placeholder}
          value={reply.draft.body}
          className={COMPOSER_TEXTAREA_CLASS}
          onChange={(event) => reply.draft.setBody(event.target.value)}
          onKeyDown={(event) => submitOnModEnter(event, () => formRef.current?.requestSubmit())}
          onPaste={(event) => {
            const pasted = filesFromClipboard(event.clipboardData);
            // Word and Excel put a picture of the copied text next to the text itself: the text wins.
            const hasText = event.clipboardData.getData("text/plain").trim() !== "";
            if (pasted.length === 0 || hasText) {
              return;
            }
            event.preventDefault();
            reply.attachments.addFiles(pasted);
          }}
        />
        <AttachedFiles files={reply.attachments.files} onRemove={reply.attachments.removeFile} />
        <ComposerToolbar reply={reply} closedHint={isClosed ? closedHint : null} tools={tools} />
        <DropOverlay visible={drop.isOver} />
      </form>
      <FileError message={reply.attachments.fileError} />
      <FormErrorAlert message={reply.submitError} />
    </div>
  );
}

function ComposerToolbar({
  reply,
  closedHint,
  tools,
}: {
  reply: ReturnType<typeof useReplySubmission>;
  /** Null while the thread is open. */
  closedHint: string | null;
  tools: ReactNode;
}) {
  return (
    <div className={COMPOSER_TOOLBAR_CLASS}>
      <AttachmentButton onAdd={reply.attachments.addFiles} />
      {tools}
      {closedHint === null ? null : (
        <span className="ml-1.5 truncate text-xs text-muted-foreground">{closedHint}</span>
      )}
      <ComposerStatus draft={reply.draft.state} length={reply.draft.body.length} />
      <Hint label="Ctrl + Enter">
        <Button
          type="submit"
          size="sm"
          disabled={reply.isSending}
          aria-busy={reply.isSending}
          className="ml-2 shrink-0"
        >
          {reply.isSending ? <CircleNotchIcon className="animate-spin" aria-hidden="true" /> : null}
          {reply.isSending ? "Enviando…" : "Enviar"}
        </Button>
      </Hint>
    </div>
  );
}
