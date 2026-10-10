import {
  MIN_PASSWORD_LENGTH,
  newPasswordSchema,
  resetPasswordSchema,
} from "@sellbridge/shared/schemas";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthPageHeader, AuthSubmitButton } from "@/components/auth/auth-page";
import { liveFieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FloatingPasswordField } from "@/components/form/floating-field";
import { InlineFormError } from "@/components/form/inline-form-error";
import { authClient } from "@/lib/auth-client";

/** Better Auth redirects here with `?token=...`, or `?error=INVALID_TOKEN` for a bad link. */
const resetSearchSchema = z.object({
  token: z.string().min(1).optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/_auth/redefinir-senha")({
  validateSearch: resetSearchSchema,
  head: () => ({ meta: [{ title: "Redefinir senha | SellBridge" }] }),
  component: ResetPasswordPage,
});

const INVALID_LINK_MESSAGE = "Este link é inválido ou expirou. Peça um novo para continuar.";

function useResetPasswordForm(token: string) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { password: "" },
    validators: { onSubmit: resetPasswordSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const result = await authClient.resetPassword({ newPassword: value.password, token });
      if (result.error) {
        setSubmitError(INVALID_LINK_MESSAGE);
        return;
      }
      await navigate({ to: "/login", search: { senhaRedefinida: true } });
    },
  });

  return { form, submitError };
}

function ResetPasswordForm({ token }: { token: string }) {
  const { form, submitError } = useResetPasswordForm(token);
  const hasSubmitted = useStore(form.store, (state) => state.submissionAttempts > 0);
  return (
    <form noValidate className="grid gap-3" onSubmit={submitHandler(() => form.handleSubmit())}>
      <form.Field
        name="password"
        validators={{ onChange: newPasswordSchema, onBlur: newPasswordSchema }}
      >
        {(field) => (
          <FloatingPasswordField
            id="password"
            label="Nova senha"
            autoComplete="new-password"
            hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
            {...liveFieldBindings(field, hasSubmitted)}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <AuthSubmitButton
            isPending={isSubmitting}
            idleLabel="Salvar nova senha"
            pendingLabel="Salvando..."
          />
        )}
      </form.Subscribe>
      <InlineFormError message={submitError} />
    </form>
  );
}

function ResetPasswordPage() {
  const search = Route.useSearch();
  const token = search.error ? undefined : search.token;
  return (
    <div className="space-y-8">
      <AuthPageHeader
        title="Criar nova senha"
        description={
          token ? "Escolha a senha que você vai usar para entrar." : INVALID_LINK_MESSAGE
        }
      />
      {token ? <ResetPasswordForm token={token} /> : null}
      <p className="text-center text-subhead text-muted-foreground">
        <Link
          to={token ? "/login" : "/esqueci-senha"}
          className="font-medium text-brand-text underline-offset-4 hover:underline"
        >
          {token ? "Voltar para o login" : "Pedir um novo link"}
        </Link>
      </p>
    </div>
  );
}
