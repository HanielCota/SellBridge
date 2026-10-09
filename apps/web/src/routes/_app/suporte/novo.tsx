import { createTicketSchema } from "@sellbridge/shared/schemas";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { fieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { TextField } from "@/components/form/form-field";
import { TextareaField } from "@/components/form/textarea-field";
import { PageHeader } from "@/components/layout/page-header";
import { AttachmentInput } from "@/components/support/attachment-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/suporte/novo")({
  head: () => ({ meta: [{ title: "Novo chamado | SellBridge" }] }),
  component: NewTicketPage,
});

const createdSchema = z.object({ ticketId: z.uuid() });

interface NewTicketValues {
  subject: string;
  body: string;
}

function buildTicketFormData(value: NewTicketValues, files: readonly File[]): FormData {
  const formData = new FormData();
  formData.set("subject", value.subject);
  formData.set("body", value.body);
  for (const file of files) {
    formData.append("files", file);
  }
  return formData;
}

function useNewTicketForm(files: readonly File[]) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { subject: "", body: "" },
    validators: { onSubmit: createTicketSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const response = await postMultipart(
          "/api/suporte/chamados",
          buildTicketFormData(value, files),
        );
        const created = createdSchema.parse(response);
        toast.success("Chamado aberto. Responderemos em breve.");
        await queryClient.invalidateQueries({ queryKey: ["tickets"] });
        await navigate({ to: "/suporte/$ticketId", params: { ticketId: created.ticketId } });
      } catch (error) {
        setSubmitError(errorMessage(error));
      }
    },
  });

  return { form, submitError };
}

function BackToSupportLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
      <Link to="/suporte">
        <ArrowLeft aria-hidden="true" />
        Suporte
      </Link>
    </Button>
  );
}

function NewTicketForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const { form, submitError } = useNewTicketForm(files);

  return (
    <form noValidate className="grid gap-4" onSubmit={submitHandler(() => form.handleSubmit())}>
      <FormErrorAlert message={submitError} />
      <form.Field name="subject">
        {(field) => <TextField id="subject" label="Assunto" {...fieldBindings(field)} />}
      </form.Field>
      <form.Field name="body">
        {(field) => (
          <TextareaField id="body" label="Descrição" rows={6} {...fieldBindings(field)} />
        )}
      </form.Field>
      <AttachmentInput files={files} onChange={setFiles} error={fileError} onError={setFileError} />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <PendingSubmitButton
            isPending={isSubmitting}
            idleLabel="Abrir chamado"
            pendingLabel="Enviando..."
            className="justify-self-end"
          />
        )}
      </form.Subscribe>
    </form>
  );
}

function NewTicketPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <BackToSupportLink />
      <PageHeader
        title="Novo chamado"
        description="Conte o que aconteceu e anexe prints ou comprovantes."
      />
      <Card>
        <CardContent>
          <NewTicketForm />
        </CardContent>
      </Card>
    </div>
  );
}
