import { CircleNotchIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert } from "@/components/form/form-feedback";
import {
  AttachedFiles,
  AttachmentButton,
  COMPOSER_BOX_CLASS,
  COMPOSER_TEXTAREA_CLASS,
  COMPOSER_TOOLBAR_CLASS,
  FileError,
  submitOnModEnter,
  useComposerFiles,
} from "@/components/support/composer-parts";
import { Button } from "@/components/ui/button";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";

const MIN_BODY_LENGTH = 10;

interface ReplyFormProps {
  endpoint: string;
  /** A reply on a closed ticket reopens it; the form says so up front. */
  isClosed: boolean;
  onSent: () => Promise<void> | void;
}

function buildReplyFormData(body: string, files: readonly File[]): FormData {
  const formData = new FormData();
  formData.set("body", body);
  for (const file of files) {
    formData.append("files", file);
  }
  return formData;
}

function useReplySubmission({ endpoint, onSent }: Pick<ReplyFormProps, "endpoint" | "onSent">) {
  const [body, setBody] = useState("");
  const attachments = useComposerFiles();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function submit() {
    setSubmitError(null);
    if (body.trim().length < MIN_BODY_LENGTH) {
      setSubmitError("Escreva ao menos 10 caracteres");
      return;
    }
    const formData = buildReplyFormData(body, attachments.files);
    setIsSending(true);
    try {
      await postMultipart(endpoint, formData);
      setBody("");
      attachments.clear();
      await onSent();
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  return { body, setBody, attachments, submitError, isSending, submit };
}

/** Reseller reply: the same single-box composer the support team uses, without its tools. */
export function ReplyForm({ endpoint, isClosed, onSent }: ReplyFormProps) {
  const reply = useReplySubmission({ endpoint, onSent });
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-2">
      <form
        ref={formRef}
        noValidate
        className={COMPOSER_BOX_CLASS}
        onSubmit={submitHandler(reply.submit)}
      >
        <textarea
          id="reply-body"
          aria-label="Sua resposta"
          rows={3}
          placeholder="Escreva sua resposta para o suporte..."
          value={reply.body}
          className={COMPOSER_TEXTAREA_CLASS}
          onChange={(event) => reply.setBody(event.target.value)}
          onKeyDown={(event) => submitOnModEnter(event, () => formRef.current?.requestSubmit())}
        />
        <AttachedFiles files={reply.attachments.files} onRemove={reply.attachments.removeFile} />
        <div className={COMPOSER_TOOLBAR_CLASS}>
          <AttachmentButton onAdd={reply.attachments.addFiles} />
          {isClosed ? (
            <span className="ml-1.5 truncate text-xs text-muted-foreground">
              Responder reabre o chamado
            </span>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={reply.isSending}
            aria-busy={reply.isSending}
            title="Ctrl + Enter"
            className="ml-auto"
          >
            {reply.isSending ? (
              <CircleNotchIcon className="animate-spin" aria-hidden="true" />
            ) : null}
            {reply.isSending ? "Enviando..." : "Enviar resposta"}
          </Button>
        </div>
      </form>
      <FileError message={reply.attachments.fileError} />
      <FormErrorAlert message={reply.submitError} />
    </div>
  );
}
