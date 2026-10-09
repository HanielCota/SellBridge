import { createTicketSchema } from "@sellbridge/shared/schemas";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { firstErrorMessage, TextField } from "@/components/form/form-field";
import { PageHeader } from "@/components/layout/page-header";
import { AttachmentInput } from "@/components/support/attachment-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/suporte/novo")({
  head: () => ({ meta: [{ title: "Novo chamado | SellBridge" }] }),
  component: NewTicketPage,
});

const createdSchema = z.object({ ticketId: z.uuid() });

function NewTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { subject: "", body: "" },
    validators: { onSubmit: createTicketSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const formData = new FormData();
      formData.set("subject", value.subject);
      formData.set("body", value.body);
      for (const file of files) {
        formData.append("files", file);
      }
      try {
        const created = createdSchema.parse(await postMultipart("/api/suporte/chamados", formData));
        toast.success("Chamado aberto. Responderemos em breve.");
        await queryClient.invalidateQueries({ queryKey: ["tickets"] });
        await navigate({ to: "/suporte/$ticketId", params: { ticketId: created.ticketId } });
      } catch (error) {
        setSubmitError(errorMessage(error));
      }
    },
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/suporte">
          <ArrowLeft aria-hidden="true" />
          Suporte
        </Link>
      </Button>
      <PageHeader
        title="Novo chamado"
        description="Conte o que aconteceu e anexe prints ou comprovantes."
      />
      <Card>
        <CardContent>
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            {submitError ? (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            ) : null}
            <form.Field name="subject">
              {(field) => (
                <TextField
                  id="subject"
                  label="Assunto"
                  value={field.state.value}
                  errors={field.state.meta.errors}
                  onBlur={field.handleBlur}
                  onValueChange={field.handleChange}
                />
              )}
            </form.Field>
            <form.Field name="body">
              {(field) => {
                const message = firstErrorMessage(field.state.meta.errors);
                return (
                  <div className="grid gap-2">
                    <Label htmlFor="body">Descrição</Label>
                    <Textarea
                      id="body"
                      rows={6}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={message ? true : undefined}
                      aria-describedby={message ? "body-error" : undefined}
                    />
                    {message ? (
                      <p id="body-error" className="text-sm text-destructive">
                        {message}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </form.Field>
            <AttachmentInput
              files={files}
              onChange={setFiles}
              error={fileError}
              onError={setFileError}
            />
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting} className="justify-self-end">
                  {isSubmitting ? "Enviando..." : "Abrir chamado"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
