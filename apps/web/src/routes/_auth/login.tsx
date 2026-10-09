import { emailSchema, signInSchema } from "@sellbridge/shared/schemas";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthSubmitButton } from "@/components/auth/auth-page";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { liveFieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FloatingPasswordField, FloatingTextField } from "@/components/form/floating-field";
import { InlineFormError } from "@/components/form/inline-form-error";
import { authClient } from "@/lib/auth-client";

const loginSearchSchema = z.object({
  redirect: z.string().startsWith("/").optional(),
  /** Set by Better Auth when a social sign-in fails. */
  error: z.string().optional(),
  /** Set after a successful password reset. */
  senhaRedefinida: z.boolean().optional(),
});

const passwordRequiredSchema = signInSchema.shape.password;

export const Route = createFileRoute("/_auth/login")({
  validateSearch: loginSearchSchema,
  head: () => ({ meta: [{ title: "Entrar | SellBridge" }] }),
  component: LoginPage,
});

const authLayoutRoute = getRouteApi("/_auth");

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

  return { form, submitError, clearSubmitError: () => setSubmitError(null) };
}

type LoginFormApi = ReturnType<typeof useLoginForm>["form"];

interface LoginFieldsProps {
  form: LoginFormApi;
  hasSubmitted: boolean;
  submitError: string | null;
  clearSubmitError: () => void;
}

/** A failed sign-in marks both fields and shows the message under the password. */
function LoginFields({ form, hasSubmitted, submitError, clearSubmitError }: LoginFieldsProps) {
  return (
    <>
      <form.Field name="email" validators={{ onChange: emailSchema, onBlur: emailSchema }}>
        {(field) => {
          const bindings = liveFieldBindings(field, hasSubmitted);
          return (
            <FloatingTextField
              id="email"
              label="E-mail"
              type="email"
              autoComplete="email"
              invalid={submitError !== null}
              {...bindings}
              onValueChange={(value) => {
                clearSubmitError();
                bindings.onValueChange(value);
              }}
            />
          );
        }}
      </form.Field>
      <form.Field
        name="password"
        validators={{ onChange: passwordRequiredSchema, onBlur: passwordRequiredSchema }}
      >
        {(field) => {
          const bindings = liveFieldBindings(field, hasSubmitted);
          return (
            <FloatingPasswordField
              id="password"
              label="Senha"
              autoComplete="current-password"
              {...bindings}
              errors={submitError ? [submitError] : bindings.errors}
              onValueChange={(value) => {
                clearSubmitError();
                bindings.onValueChange(value);
              }}
            />
          );
        }}
      </form.Field>
    </>
  );
}

function LoginForm() {
  const { form, submitError, clearSubmitError } = useLoginForm();
  const hasSubmitted = useStore(form.store, (state) => state.submissionAttempts > 0);

  return (
    <form noValidate className="grid gap-3" onSubmit={submitHandler(() => form.handleSubmit())}>
      <LoginFields
        form={form}
        hasSubmitted={hasSubmitted}
        submitError={submitError}
        clearSubmitError={clearSubmitError}
      />
      <Link
        to="/esqueci-senha"
        className="justify-self-end px-1 text-[13px] font-medium text-brand-strong underline-offset-4 hover:underline dark:text-brand"
      >
        Esqueceu a senha?
      </Link>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <AuthSubmitButton
            isPending={isSubmitting}
            idleLabel="Entrar"
            pendingLabel="Entrando..."
          />
        )}
      </form.Subscribe>
    </form>
  );
}

function LoginNotices() {
  const search = Route.useSearch();
  if (search.senhaRedefinida) {
    return (
      <output className="block text-center text-[15px] text-brand-strong dark:text-brand">
        Senha redefinida. Entre com a nova senha.
      </output>
    );
  }
  return (
    <InlineFormError
      message={search.error ? "Não foi possível entrar com o Google. Tente novamente." : null}
    />
  );
}

function LoginPage() {
  const signInOptions = authLayoutRoute.useLoaderData();
  const search = Route.useSearch();
  return (
    <div className="space-y-8">
      <h1 className="sr-only">Entrar</h1>
      <LoginNotices />
      <div className="grid gap-5">
        {signInOptions.google ? (
          <GoogleSignIn callbackURL={search.redirect ?? "/dashboard"} />
        ) : null}
        <LoginForm />
      </div>
      <p className="text-center text-[15px] text-muted-foreground">
        Não tem conta?{" "}
        <Link
          to="/cadastro"
          className="font-medium text-brand-strong underline-offset-4 hover:underline dark:text-brand"
        >
          Crie a sua agora
        </Link>
      </p>
    </div>
  );
}
