import { DEFAULT_DEVELOPER_SCOPES } from "@sellbridge/shared/developer-api";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { SegmentedControl } from "@/components/data/segmented-control";
import { DeveloperScopeCheckboxes } from "@/components/developer-api/developer-scope-checkboxes";
import { FloatingTextField } from "@/components/form/floating-field";
import { fieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import {
  CodeSnippet,
  OneTimeSecretWarning,
  SecretField,
} from "@/components/integrations/secret-field";
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
  DEVELOPER_KEY_VALIDITIES,
  DEVELOPER_KEY_VALIDITY_LABELS,
  developerKeyCurlExample,
  type DeveloperKeyValidity,
  developerKeyFormSchema,
  type DeveloperKeyFormValues,
} from "@/features/developer-api/developer-keys";
import { useCreateDeveloperKey } from "@/features/developer-api/use-create-developer-key";
import { errorMessage } from "@/lib/errors";

const DEFAULT_VALUES: DeveloperKeyFormValues = {
  name: "",
  scopes: [...DEFAULT_DEVELOPER_SCOPES],
  validity: "90",
};

function useDeveloperKeyForm(onCreated: (secret: string) => void) {
  const mutation = useCreateDeveloperKey();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: DEFAULT_VALUES,
    validators: { onSubmit: developerKeyFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const issued = await mutation.mutateAsync({ ...value, name: value.name.trim() });
        toast.success("Chave criada");
        onCreated(issued.secret);
      } catch (error) {
        setSubmitError(errorMessage(error));
      }
    },
  });
  return { form, submitError };
}

function ValidityField({
  value,
  onChange,
}: {
  value: DeveloperKeyValidity;
  onChange: (value: DeveloperKeyValidity) => void;
}) {
  return (
    <div className="grid gap-2">
      {/* The fieldset legend inside names the group for screen readers. */}
      <p aria-hidden="true" className="text-sm font-medium">
        Vale por
      </p>
      <SegmentedControl
        legend="Vale por"
        options={DEVELOPER_KEY_VALIDITIES}
        labels={DEVELOPER_KEY_VALIDITY_LABELS}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function DeveloperKeyForm({
  onCreated,
  onCancel,
}: {
  onCreated: (secret: string) => void;
  onCancel: () => void;
}) {
  const { form, submitError } = useDeveloperKeyForm(onCreated);
  return (
    <form noValidate className="grid gap-5" onSubmit={submitHandler(() => form.handleSubmit())}>
      <FormErrorAlert message={submitError} />
      <form.Field name="name">
        {(field) => (
          <FloatingTextField
            id="developer-key-name"
            label="Nome da chave"
            maxLength={60}
            autoComplete="off"
            hint="O projeto que vai usá-la, como “Painel de vendas” ou “Robô de relatórios”."
            {...fieldBindings(field)}
          />
        )}
      </form.Field>
      <form.Field name="scopes">
        {(field) => (
          <DeveloperScopeCheckboxes
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="validity">
        {(field) => <ValidityField value={field.state.value} onChange={field.handleChange} />}
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

function SecretReveal({ secret }: { secret: string }) {
  return (
    <div className="grid min-w-0 gap-5">
      <OneTimeSecretWarning>
        Copie e guarde a chave agora, nas variáveis de ambiente do projeto que vai usá-la. Por
        segurança, ela não será mostrada de novo.
      </OneTimeSecretWarning>
      <SecretField
        id="developer-key-secret"
        label="Chave secreta"
        value={secret}
        copyLabel="Copiar chave"
      />
      <CodeSnippet
        id="developer-key-curl"
        title="Teste no terminal"
        code={developerKeyCurlExample(window.location.origin, secret)}
        copyLabel="Copiar comando"
        wrap
      />
    </div>
  );
}

/**
 * The form, then the secret shown once. While the secret is on screen, clicking outside does
 * not close the dialog, so it is never lost by accident.
 */
export function CreateDeveloperKeyDialog({
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
          if (secret !== null) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {secret === null ? "Nova chave de desenvolvedor" : "Chave criada"}
          </DialogTitle>
          <DialogDescription>
            {secret === null
              ? "A chave lê os dados de todas as organizações, só nos tipos que você marcar, e nunca muda os dados delas. Se você marcar, ela também cria links de entrada."
              : "Use esta chave no cabeçalho Authorization das chamadas a /api/dev/v1."}
          </DialogDescription>
        </DialogHeader>
        {secret === null ? (
          <DeveloperKeyForm onCreated={setSecret} onCancel={() => handleOpenChange(false)} />
        ) : (
          <>
            <SecretReveal secret={secret} />
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Já guardei a chave
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
