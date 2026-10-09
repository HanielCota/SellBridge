import { signInSchema } from "@sellbridge/shared/schemas";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { fieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { TextField } from "@/components/form/form-field";
import { authClient } from "@/lib/auth-client";

const loginSearchSchema = z.object({
  redirect: z.string().startsWith("/").optional(),
});

export const Route = createFileRoute("/_auth/login")({
  validateSearch: loginSearchSchema,
  head: () => ({ meta: [{ title: "Entrar | SellBridge" }] }),
  component: LoginPage,
});

function useLoginForm() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const result = await authClient.signIn.email(value);
      if (result.error) {
        setSubmitError("E-mail ou senha incorretos.");
        return;
      }
      await navigate({ to: search.redirect ?? "/dashboard" });
    },
  });

  return { form, submitError };
}

function LoginForm() {
  const { form, submitError } = useLoginForm();

  return (
    <>
      <FormErrorAlert message={submitError} />
      <form noValidate className="grid gap-4" onSubmit={submitHandler(() => form.handleSubmit())}>
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
              autoComplete="current-password"
              {...fieldBindings(field)}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <PendingSubmitButton
              isPending={isSubmitting}
              idleLabel="Entrar"
              pendingLabel="Entrando..."
            />
          )}
        </form.Subscribe>
      </form>
    </>
  );
}

function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Entrar</h1>
        <p className="text-sm text-muted-foreground">Acesse seu painel de vendas.</p>
      </div>
      <LoginForm />
      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link
          to="/cadastro"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}
