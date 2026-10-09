import {
  emailSchema,
  MIN_PASSWORD_LENGTH,
  nameSchema,
  newPasswordSchema,
  signUpSchema,
} from "@sellbridge/shared/schemas";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthPageHeader, AuthSubmitButton } from "@/components/auth/auth-page";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { liveFieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FloatingPasswordField, FloatingTextField } from "@/components/form/floating-field";
import { InlineFormError } from "@/components/form/inline-form-error";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/cadastro")({
  head: () => ({ meta: [{ title: "Criar conta | SellBridge" }] }),
  component: SignUpPage,
});

const authLayoutRoute = getRouteApi("/_auth");

const EXISTING_ACCOUNT_MESSAGE = "Já existe uma conta com este e-mail.";

const SIGN_UP_ERRORS: Record<string, string> = {
  USER_ALREADY_EXISTS: EXISTING_ACCOUNT_MESSAGE,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: EXISTING_ACCOUNT_MESSAGE,
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
    defaultValues: { name: "", email: "", password: "" },
    validators: { onSubmit: signUpSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const result = await authClient.signUp.email(value);
      if (result.error) {
        setSubmitError(signUpErrorMessage(result.error.code));
        return;
      }
      await navigate({ to: "/onboarding" });
    },
  });

  return { form, submitError };
}

type SignUpFormApi = ReturnType<typeof useSignUpForm>["form"];

function SignUpFields({ form, hasSubmitted }: { form: SignUpFormApi; hasSubmitted: boolean }) {
  return (
    <>
      <form.Field name="name" validators={{ onChange: nameSchema, onBlur: nameSchema }}>
        {(field) => (
          <FloatingTextField
            id="name"
            label="Nome"
            autoComplete="name"
            {...liveFieldBindings(field, hasSubmitted)}
          />
        )}
      </form.Field>
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
      <form.Field
        name="password"
        validators={{ onChange: newPasswordSchema, onBlur: newPasswordSchema }}
      >
        {(field) => (
          <FloatingPasswordField
            id="password"
            label="Senha"
            autoComplete="new-password"
            hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
            {...liveFieldBindings(field, hasSubmitted)}
          />
        )}
      </form.Field>
    </>
  );
}

function SignUpForm() {
  const { form, submitError } = useSignUpForm();
  const hasSubmitted = useStore(form.store, (state) => state.submissionAttempts > 0);

  return (
    <form noValidate className="grid gap-3" onSubmit={submitHandler(() => form.handleSubmit())}>
      <SignUpFields form={form} hasSubmitted={hasSubmitted} />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <AuthSubmitButton
            isPending={isSubmitting}
            idleLabel="Criar conta"
            pendingLabel="Criando conta..."
          />
        )}
      </form.Subscribe>
      <InlineFormError message={submitError} />
    </form>
  );
}

function TermsConsent() {
  const linkClassName = "text-foreground underline underline-offset-2";
  return (
    <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
      Ao criar a conta, você concorda com os{" "}
      <Link to="/termos" className={linkClassName}>
        Termos de Uso
      </Link>{" "}
      e a{" "}
      <Link to="/privacidade" className={linkClassName}>
        Política de Privacidade
      </Link>
      .
    </p>
  );
}

function SignUpPage() {
  const signInOptions = authLayoutRoute.useLoaderData();
  return (
    <div className="space-y-8">
      <AuthPageHeader title="Criar conta" description="Comece a vender em poucos minutos." />
      <div className="grid gap-5">
        {signInOptions.google ? <GoogleSignIn callbackURL="/dashboard" /> : null}
        <SignUpForm />
        <TermsConsent />
      </div>
      <p className="text-center text-[15px] text-muted-foreground">
        Já tem conta?{" "}
        <Link
          to="/login"
          className="font-medium text-brand-text underline-offset-4 hover:underline dark:text-brand-text"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
