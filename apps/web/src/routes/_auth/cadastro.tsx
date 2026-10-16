import {
  emailSchema,
  MIN_PASSWORD_LENGTH,
  nameSchema,
  newPasswordSchema,
  PASSWORD_COMPROMISED_CODE,
  PASSWORD_COMPROMISED_MESSAGE,
  signUpFormSchema,
} from "@sellbridge/shared/schemas";
import { TERMS_VERSION } from "@sellbridge/shared/terms";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthPageHeader, AuthSubmitButton } from "@/components/auth/auth-page";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { TermsConsentCheckbox } from "@/components/auth/terms-consent-checkbox";
import { liveFieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FloatingPasswordField, FloatingTextField } from "@/components/form/floating-field";
import { InlineFormError } from "@/components/form/inline-form-error";
import { acceptTermsFn } from "@/features/onboarding/terms.functions";
import { authClient } from "@/lib/auth-client";
import { reportRouteError } from "@/lib/report-route-error";
import { shareMeta } from "@/lib/share-meta";

export const Route = createFileRoute("/_auth/cadastro")({
  head: () => ({
    meta: shareMeta({
      title: "Criar conta | SellBridge",
      description:
        "Crie sua conta, escolha atacadistas de todo o Brasil e venda sem estoque no Mercado Livre, na Shopee e no TikTok Shop.",
    }),
  }),
  component: SignUpPage,
});

const authLayoutRoute = getRouteApi("/_auth");

const EXISTING_ACCOUNT_MESSAGE = "Já existe uma conta com este e-mail.";

const SIGN_UP_ERRORS: Record<string, string> = {
  USER_ALREADY_EXISTS: EXISTING_ACCOUNT_MESSAGE,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: EXISTING_ACCOUNT_MESSAGE,
  PASSWORD_TOO_SHORT: "A senha é muito curta.",
  [PASSWORD_COMPROMISED_CODE]: PASSWORD_COMPROMISED_MESSAGE,
};

function signUpErrorMessage(code: string | undefined): string {
  if (!code) {
    return "Não foi possível criar sua conta. Tente novamente.";
  }
  return SIGN_UP_ERRORS[code] ?? "Não foi possível criar sua conta. Tente novamente.";
}

/**
 * Stores the box ticked on sign-up with version and date (item 26.a). If it fails, the account
 * still exists and the app asks the terms again on the next page (`needsTermsAcceptance`).
 */
async function recordAcceptance() {
  try {
    await acceptTermsFn({ data: { version: TERMS_VERSION } });
  } catch (error) {
    await reportRouteError(error, "/_auth/cadastro");
  }
}

function useSignUpForm() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "", acceptedTerms: false },
    validators: { onSubmit: signUpFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const { acceptedTerms: _acceptedTerms, ...account } = value;
      const result = await authClient.signUp.email(account);
      if (result.error) {
        setSubmitError(signUpErrorMessage(result.error.code));
        return;
      }
      await recordAcceptance();
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
      <form.Field name="acceptedTerms">
        {(field) => (
          <div className="grid gap-1.5">
            <TermsConsentCheckbox
              checked={field.state.value}
              invalid={hasSubmitted && field.state.meta.errors.length > 0}
              onCheckedChange={(checked) => field.handleChange(checked)}
            />
            <InlineFormError
              message={hasSubmitted ? termsErrorMessage(field.state.meta.errors) : null}
            />
          </div>
        )}
      </form.Field>
    </>
  );
}

function termsErrorMessage(errors: readonly unknown[]): string | null {
  return errors.length > 0 ? "Marque que você aceita os termos para criar a conta." : null;
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
            pendingLabel="Criando conta…"
          />
        )}
      </form.Subscribe>
      <InlineFormError message={submitError} />
    </form>
  );
}

function SignUpPage() {
  const signInOptions = authLayoutRoute.useLoaderData();
  return (
    <div className="space-y-8">
      <AuthPageHeader
        title="Criar conta"
        description="Conecte suas lojas e venda produtos de fornecedores de todo o Brasil, sem estoque."
      />
      <div className="grid gap-5">
        {signInOptions.google ? <GoogleSignIn callbackURL="/dashboard" /> : null}
        <SignUpForm />
      </div>
      <p className="text-center text-subhead text-muted-foreground">
        Já tem conta?{" "}
        <Link
          to="/login"
          className="font-medium text-brand-text underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
