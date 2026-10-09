import { useState } from "react";
import { AttachmentInput } from "@/components/support/attachment-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";

interface ReplyFormProps {
  endpoint: string;
  label: string;
  onSent: () => Promise<void> | void;
}

export function ReplyForm({ endpoint, label, onSent }: ReplyFormProps) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function submit() {
    setSubmitError(null);
    if (body.trim().length < 10) {
      setSubmitError("Escreva ao menos 10 caracteres");
      return;
    }
    const formData = new FormData();
    formData.set("body", body);
    for (const file of files) {
      formData.append("files", file);
    }
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

  return (
    <form
      noValidate
      className="grid gap-3 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="reply-body">{label}</Label>
        <Textarea
          id="reply-body"
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>
      <AttachmentInput files={files} onChange={setFiles} error={fileError} onError={setFileError} />
      {submitError ? (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSending}>
          {isSending ? "Enviando..." : "Enviar resposta"}
        </Button>
      </div>
    </form>
  );
}
