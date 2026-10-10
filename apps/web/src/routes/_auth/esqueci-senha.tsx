import { emailSchema, forgotPasswordSchema } from "@sellbridge/shared/schemas";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthPageHeader, AuthSubmitButton } from "@/components/auth/auth-page";
import { liveFieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FloatingTextField } from "@/components/form/floating-field";
import { InlineFormError } from "@/components/form/inline-form-error";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/esqueci-senha")({
  head: () => ({ meta: [{ title: "Esqueci a senha | SellBridge" }] }),
  component: ForgotPasswordPage,
});

function useForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: forgotPasswordSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const result = await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: "/redefinir-senha",
      });
      if (result.error) {
        setSubmitError("Não foi possível enviar o link agora. Tente novamente em instantes.");
        return;
      }
      setSentTo(value.email);
    },
  });

  return { form, sentTo, submitError };
}

function ResetLinkSent({ email }: { email: string }) {
  return (
    <output className="block space-y-2 text-center">
      <span className="block text-body">Verifique sua caixa de entrada.</span>
      <span className="block text-subhead font-light text-balance text-muted-foreground">
        Se houver uma conta com <span className="font-medium text-foreground">{email}</span>,
        enviamos um link para criar uma nova senha. Ele vale por 1 hora.
      </span>
    </output>
  );
}

function ForgotPasswordForm() {
  const { form, sentTo, submitError } = useForgotPasswordForm();
  const hasSubmitted = useStore(form.store, (state) => state.submissionAttempts > 0);
  if (sentTo) {
    return <ResetLinkSent email={sentTo} />;
  }
  return (
    <form noValidate className="grid gap-3" onSubmit={submitHandler(() => form.handleSubmit())}>
      <form.Field name="email" validators={{ onChange: emailSchema, onBlur: emailSchema }}>
        {(field) => (
          <FloatingTextField
            id="email"
            label="E-mail"
            type="email"
            autoComplete="email"
            {...liveFieldBindings(field, hasSubmitted)}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <AuthSubmitButton
            isPending={isSubmitting}
            idleLabel="Enviar link"
            pendingLabel="Enviando..."
          />
        )}
      </form.Subscribe>
      <InlineFormError message={submitError} />
    </form>
  );
}

function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <AuthPageHeader
        title="Esqueceu a senha?"
        description="Informe o e-mail da conta e enviaremos um link para criar uma nova senha."
      />
      <ForgotPasswordForm />
      <p className="text-center text-subhead text-muted-foreground">
        <Link
          to="/login"
          className="font-medium text-brand-text underline-offset-4 hover:underline"
        >
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
