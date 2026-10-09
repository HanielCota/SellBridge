import { signUpSchema } from "@sellbridge/shared/schemas";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { fieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { TextField } from "@/components/form/form-field";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/cadastro")({
  head: () => ({ meta: [{ title: "Criar conta | SellBridge" }] }),
  component: SignUpPage,
});

const SIGN_UP_ERRORS: Record<string, string> = {
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail.",
  PASSWORD_TOO_SHORT: "A senha é muito curta.",
};

function signUpErrorMessage(code: string | undefined): string {
  if (!code) {
    return "Não foi possível criar sua conta. Tente novamente.";
  }
  return SIGN_UP_ERRORS[code] ?? "Não foi possível criar sua conta. Tente novamente.";
}

function useSignUpForm() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    validators: { onSubmit: signUpSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const result = await authClient.signUp.email({
        name: value.name,
        email: value.email,
        password: value.password,
      });
      if (result.error) {
        setSubmitError(signUpErrorMessage(result.error.code));
        return;
      }
      await navigate({ to: "/onboarding" });
    },
  });

  return { form, submitError };
}

function SignUpForm() {
  const { form, submitError } = useSignUpForm();

  return (
    <>
      <FormErrorAlert message={submitError} />
      <form noValidate className="grid gap-4" onSubmit={submitHandler(() => form.handleSubmit())}>
        <form.Field name="name">
          {(field) => (
            <TextField id="name" label="Nome" autoComplete="name" {...fieldBindings(field)} />
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <TextField
              id="email"
              label="E-mail"
              type="email"
              autoComplete="email"
              {...fieldBindings(field)}
            />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <TextField
              id="password"
              label="Senha"
              type="password"
              autoComplete="new-password"
              {...fieldBindings(field)}
            />
          )}
        </form.Field>
        <form.Field name="confirmPassword">
          {(field) => (
            <TextField
              id="confirmPassword"
              label="Confirmar senha"
              type="password"
              autoComplete="new-password"
              {...fieldBindings(field)}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <PendingSubmitButton
              isPending={isSubmitting}
              idleLabel="Criar conta"
              pendingLabel="Criando conta..."
            />
          )}
        </form.Subscribe>
      </form>
    </>
  );
}

function SignUpPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Criar conta</h1>
        <p className="text-sm text-muted-foreground">Comece a vender em poucos minutos.</p>
      </div>
      <SignUpForm />
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link
          to="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
