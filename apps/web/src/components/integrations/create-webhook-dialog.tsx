import { type ApiEventType, apiEventTypeSchema } from "@sellbridge/shared/public-api";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { FloatingTextField } from "@/components/form/floating-field";
import { fieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { EventTypeCheckboxes } from "@/components/integrations/event-type-checkboxes";
import { WebhookSecretReveal } from "@/components/integrations/webhook-secret-reveal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateWebhookEndpoint } from "@/features/public-api/use-create-webhook-endpoint";
import { webhookDescriptionSchema, webhookUrlSchema } from "@/features/public-api/webhooks";
import { errorMessage } from "@/lib/errors";

interface WebhookFormValues {
  url: string;
  description: string;
  eventTypes: ApiEventType[];
}

/** The server schema's rules, with every field present as the form always sends them. */
const webhookFormSchema = z.object({
  url: webhookUrlSchema,
  description: webhookDescriptionSchema,
  eventTypes: z.array(apiEventTypeSchema),
});

const DEFAULT_VALUES: WebhookFormValues = { url: "", description: "", eventTypes: [] };

function useWebhookForm(onCreated: (secret: string) => void) {
  const mutation = useCreateWebhookEndpoint();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: DEFAULT_VALUES,
    validators: { onSubmit: webhookFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const created = await mutation.mutateAsync(value);
        toast.success("Webhook criado");
        onCreated(created.secret);
      } catch (error) {
        setSubmitError(errorMessage(error));
      }
    },
  });
  return { form, submitError };
}

function WebhookForm({
  onCreated,
  onCancel,
}: {
  onCreated: (secret: string) => void;
  onCancel: () => void;
}) {
  const { form, submitError } = useWebhookForm(onCreated);
  return (
    <form noValidate className="grid gap-5" onSubmit={submitHandler(() => form.handleSubmit())}>
      <FormErrorAlert message={submitError} />
      <form.Field name="url">
        {(field) => (
          <FloatingTextField
            id="webhook-url"
            label="URL de destino"
            type="url"
            inputMode="url"
            autoComplete="off"
            maxLength={2000}
            hint="Endereço https do seu sistema que vai receber os eventos."
            {...fieldBindings(field)}
          />
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <FloatingTextField
            id="webhook-description"
            label="Descrição (opcional)"
            autoComplete="off"
            maxLength={200}
            {...fieldBindings(field)}
          />
        )}
      </form.Field>
      <form.Field name="eventTypes">
        {(field) => <EventTypeCheckboxes value={field.state.value} onChange={field.handleChange} />}
      </form.Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <PendingSubmitButton
              isPending={isSubmitting}
              idleLabel="Criar webhook"
              pendingLabel="Criando..."
            />
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

/**
 * The form, then the signing secret shown once. While the secret is on screen, clicking
 * outside does not close the dialog, so it is never lost by accident.
 */
export function CreateWebhookDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  function handleOpenChange(next: boolean) {
    if (!next) {
      setSecret(null);
    }
    onOpenChange(next);
  }
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        onInteractOutside={(event) => {
          if (secret) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{secret ? "Webhook criado" : "Novo webhook"}</DialogTitle>
          <DialogDescription>
            {secret
              ? "Use o segredo para confirmar que cada entrega veio do SellBridge."
              : "O SellBridge envia um POST para esta URL a cada evento escolhido."}
          </DialogDescription>
        </DialogHeader>
        {secret ? (
          <>
            <WebhookSecretReveal secret={secret} />
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Já guardei o segredo
              </Button>
            </DialogFooter>
          </>
        ) : (
          <WebhookForm onCreated={setSecret} onCancel={() => handleOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
