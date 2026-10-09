import { signInSchema } from "@sellbridge/shared/schemas";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { TextField } from "@/components/form/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const loginSearchSchema = z.object({
  redirect: z.string().startsWith("/").optional(),
});

export const Route = createFileRoute("/_auth/login")({
  validateSearch: loginSearchSchema,
  head: () => ({ meta: [{ title: "Entrar | SellBridge" }] }),
  component: LoginPage,
});

function LoginPage() {
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Entrar</h1>
        <p className="text-sm text-muted-foreground">Acesse seu painel de vendas.</p>
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
              autoComplete="current-password"
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
              {isSubmitting ? "Entrando..." : "Entrar"}
            </Button>
          )}
        </form.Subscribe>
      </form>
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
