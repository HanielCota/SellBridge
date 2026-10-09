import { useState } from "react";
import { submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { TextareaField } from "@/components/form/textarea-field";
import { AttachmentInput } from "@/components/support/attachment-input";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";

const MIN_BODY_LENGTH = 10;
const NO_ERRORS: readonly unknown[] = [];

interface ReplyFormProps {
  endpoint: string;
  label: string;
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
  const [files, setFiles] = useState<File[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function submit() {
    setSubmitError(null);
    if (body.trim().length < MIN_BODY_LENGTH) {
      setSubmitError("Escreva ao menos 10 caracteres");
      return;
    }
    const formData = buildReplyFormData(body, files);
    setIsSending(true);
    try {
      await postMultipart(endpoint, formData);
      setBody("");
      setFiles([]);
      await onSent();
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  return { body, setBody, files, setFiles, submitError, isSending, submit };
}

export function ReplyForm({ endpoint, label, onSent }: ReplyFormProps) {
  const reply = useReplySubmission({ endpoint, onSent });
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <form
      noValidate
      className="grid gap-3 rounded-xl border p-4"
      onSubmit={submitHandler(reply.submit)}
    >
      <TextareaField
        id="reply-body"
        label={label}
        rows={4}
        value={reply.body}
        errors={NO_ERRORS}
        onValueChange={reply.setBody}
      />
      <AttachmentInput
        files={reply.files}
        onChange={reply.setFiles}
        error={fileError}
        onError={setFileError}
      />
      <FormErrorAlert message={reply.submitError} />
      <div className="flex justify-end">
        <PendingSubmitButton
          isPending={reply.isSending}
          idleLabel="Enviar resposta"
          pendingLabel="Enviando..."
        />
      </div>
    </form>
  );
}
