import { READ_ONLY_SCOPES } from "@sellbridge/shared/public-api";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { SegmentedControl } from "@/components/data/segmented-control";
import { FloatingTextField } from "@/components/form/floating-field";
import { fieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { ApiKeySecretReveal } from "@/components/integrations/api-key-secret-reveal";
import { ScopeCheckboxes } from "@/components/integrations/scope-checkboxes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  API_KEY_EXPIRATION_LABELS,
  API_KEY_EXPIRATIONS,
  type ApiKeyExpiration,
  apiKeyFormSchema,
  type ApiKeyFormValues,
  toCreateApiKeyInput,
} from "@/features/public-api/api-keys";
import { useCreateApiKey } from "@/features/public-api/use-create-api-key";
import { errorMessage } from "@/lib/errors";

const DEFAULT_VALUES: ApiKeyFormValues = {
  name: "",
  scopes: [...READ_ONLY_SCOPES],
  expiration: "never",
};

function useApiKeyForm(onCreated: (secret: string) => void) {
  const mutation = useCreateApiKey();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: DEFAULT_VALUES,
    validators: { onSubmit: apiKeyFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const issued = await mutation.mutateAsync(toCreateApiKeyInput(value, new Date()));
        toast.success("Chave criada");
        onCreated(issued.secret);
      } catch (error) {
        setSubmitError(errorMessage(error));
      }
    },
  });
  return { form, submitError };
}

function ExpirationField({
  value,
  onChange,
}: {
  value: ApiKeyExpiration;
  onChange: (value: ApiKeyExpiration) => void;
}) {
  return (
    <div className="grid gap-2">
      {/* The fieldset legend inside names the group for screen readers. */}
      <p aria-hidden="true" className="text-sm font-medium">
        Expira em
      </p>
      <SegmentedControl
        legend="Expira em"
        options={API_KEY_EXPIRATIONS}
        labels={API_KEY_EXPIRATION_LABELS}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function ApiKeyForm({
  onCreated,
  onCancel,
}: {
  onCreated: (secret: string) => void;
  onCancel: () => void;
}) {
  const { form, submitError } = useApiKeyForm(onCreated);
  return (
    <form noValidate className="grid gap-5" onSubmit={submitHandler(() => form.handleSubmit())}>
      <FormErrorAlert message={submitError} />
      <form.Field name="name">
        {(field) => (
          <FloatingTextField
            id="api-key-name"
            label="Nome da chave"
            maxLength={60}
            autoComplete="off"
            hint="Para lembrar onde ela é usada, como “ERP” ou “Planilha de pedidos”."
            {...fieldBindings(field)}
          />
        )}
      </form.Field>
      <form.Field name="scopes">
        {(field) => (
          <ScopeCheckboxes
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="expiration">
        {(field) => <ExpirationField value={field.state.value} onChange={field.handleChange} />}
      </form.Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <PendingSubmitButton
              isPending={isSubmitting}
              idleLabel="Criar chave"
              pendingLabel="Criando…"
            />
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

/**
 * Two steps in one dialog: the form, then the secret shown once. While the secret is on
 * screen, clicking outside does not close it, so it is never lost by accident.
 */
export function CreateApiKeyDialog({
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
          <DialogTitle>{secret ? "Chave criada" : "Nova chave de API"}</DialogTitle>
          <DialogDescription>
            {secret
              ? "Use esta chave no cabeçalho Authorization das chamadas à API."
              : "Dê só as permissões que a integração precisa. Você pode revogar a chave quando quiser."}
          </DialogDescription>
        </DialogHeader>
        {secret ? (
          <>
            <ApiKeySecretReveal secret={secret} />
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Já guardei a chave
              </Button>
            </DialogFooter>
          </>
        ) : (
          <ApiKeyForm onCreated={setSecret} onCancel={() => handleOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
