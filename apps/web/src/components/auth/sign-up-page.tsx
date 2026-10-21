import {
  emailSchema,
  MIN_PASSWORD_LENGTH,
  nameSchema,
  newPasswordSchema,
  PASSWORD_COMPROMISED_CODE,
  PASSWORD_COMPROMISED_MESSAGE,
  signUpFormSchema,
} from "@sellbridge/shared/schemas";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { TERMS_VERSION } from "@sellbridge/shared/terms";
import { useForm, useStore } from "@tanstack/react-form";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthPageHeader, AuthSubmitButton } from "@/components/auth/auth-page";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { SignUpProfileChoice } from "@/components/auth/sign-up-profile-choice";
import { TermsConsentCheckbox } from "@/components/auth/terms-consent-checkbox";
import { liveFieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FloatingPasswordField, FloatingTextField } from "@/components/form/floating-field";
import { InlineFormError } from "@/components/form/inline-form-error";
import { rememberSignUpProfileFn } from "@/features/auth/sign-up-profile.functions";
import { acceptTermsFn } from "@/features/onboarding/terms.functions";
import { authClient } from "@/lib/auth-client";
import { succeedsOrReports } from "@/lib/report-route-error";

const authLayoutRoute = getRouteApi("/_auth");

/** What the page says to each profile; the form fields are the same for both. */
const PAGE_COPY: Record<ProfileKind, { description: string }> = {
  seller: {
    description:
      "Conecte suas lojas e venda seus próprios produtos ou produtos de fornecedores de todo o Brasil.",
  },
  supplier: {
    description: "Cadastre seus produtos uma vez e venda por revendedores de todo o Brasil.",
  },
};

const GENERIC_SIGN_UP_ERROR = "Não foi possível criar sua conta. Tente novamente.";
const EXISTING_ACCOUNT_MESSAGE = "Já existe uma conta com este e-mail.";

const SIGN_UP_ERRORS: Record<string, string> = {
  USER_ALREADY_EXISTS: EXISTING_ACCOUNT_MESSAGE,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: EXISTING_ACCOUNT_MESSAGE,
  PASSWORD_TOO_SHORT: "A senha é muito curta.",
  [PASSWORD_COMPROMISED_CODE]: PASSWORD_COMPROMISED_MESSAGE,
};

function signUpErrorMessage(code: string | undefined): string {
  if (!code) {
    return GENERIC_SIGN_UP_ERROR;
  }
  return SIGN_UP_ERRORS[code] ?? GENERIC_SIGN_UP_ERROR;
}

/**
 * Stores the box ticked on sign-up with version and date (item 26.a). If it fails, the account
 * still exists and the app asks the terms again on the next page (`needsTermsAcceptance`).
 */
async function recordAcceptance(): Promise<void> {
  await succeedsOrReports(
    async () => acceptTermsFn({ data: { version: TERMS_VERSION } }),
    "/_auth/cadastro",
  );
}

function useSignUpForm(profileKind: ProfileKind) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "", acceptedTerms: false },
    validators: { onSubmit: signUpFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const { acceptedTerms: _acceptedTerms, ...account } = value;
      // The hook that creates the first profile reads the choice from this cookie, the same
      // way a Google sign-up carries it through the redirect (`createProfileForNewUser`).
      const isRemembered = await succeedsOrReports(
        async () => rememberSignUpProfileFn({ data: { kind: profileKind } }),
        "/_auth/cadastro",
      );
      if (!isRemembered) {
        setSubmitError(GENERIC_SIGN_UP_ERROR);
        return;
      }
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
            hint={passwordHint(field.state.value)}
            showStrength
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

/** The minimum-length hint steps aside once it is met; the strength bars take over from there. */
function passwordHint(password: string): string | undefined {
  if (password.length >= MIN_PASSWORD_LENGTH) {
    return undefined;
  }
  return `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`;
}

function termsErrorMessage(errors: readonly unknown[]): string | null {
  return errors.length > 0 ? "Marque que você aceita os termos para criar a conta." : null;
}

function SignUpForm({ profileKind }: { profileKind: ProfileKind }) {
  const { form, submitError } = useSignUpForm(profileKind);
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

/** `/cadastro` and `/cadastro/fornecedor`: the same page, opened on one profile or the other. */
export function SignUpPage({ initialKind }: { initialKind: ProfileKind }) {
  const signInOptions = authLayoutRoute.useLoaderData();
  const [profileKind, setProfileKind] = useState<ProfileKind>(initialKind);
  return (
    <div className="space-y-8">
      <AuthPageHeader title="Criar conta" description={PAGE_COPY[profileKind].description} />
      <div className="grid gap-5">
        <SignUpProfileChoice value={profileKind} onChange={setProfileKind} />
        {signInOptions.google ? (
          <GoogleSignIn
            callbackURL="/dashboard"
            onBeforeRedirect={async () => {
              await rememberSignUpProfileFn({ data: { kind: profileKind } });
            }}
          />
        ) : null}
        <SignUpForm profileKind={profileKind} />
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
