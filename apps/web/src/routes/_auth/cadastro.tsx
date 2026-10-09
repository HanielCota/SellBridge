import { signUpSchema } from "@sellbridge/shared/schemas";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { TextField } from "@/components/form/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

function SignUpPage() {
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Criar conta</h1>
        <p className="text-sm text-muted-foreground">Comece a vender em poucos minutos.</p>
      </div>
      {submitError ? (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <TextField
              id="name"
              label="Nome"
              autoComplete="name"
              value={field.state.value}
              errors={field.state.meta.errors}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <TextField
              id="email"
              label="E-mail"
              type="email"
              autoComplete="email"
              value={field.state.value}
              errors={field.state.meta.errors}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
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
              value={field.state.value}
              errors={field.state.meta.errors}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
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
              value={field.state.value}
              errors={field.state.meta.errors}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Criando conta..." : "Criar conta"}
            </Button>
          )}
        </form.Subscribe>
      </form>
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
