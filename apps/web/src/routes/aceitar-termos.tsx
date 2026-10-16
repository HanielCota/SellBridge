import { TERMS_VERSION } from "@sellbridge/shared/terms";
import { internalPathSchema } from "@sellbridge/shared/schemas";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthPageHeader, AuthSubmitButton } from "@/components/auth/auth-page";
import { AuthShell } from "@/components/auth/auth-shell";
import { TermsConsentCheckbox } from "@/components/auth/terms-consent-checkbox";
import { submitHandler } from "@/components/form/form-bindings";
import { InlineFormError } from "@/components/form/inline-form-error";
import { getAppSession } from "@/features/auth/session.functions";
import { acceptTermsFn } from "@/features/onboarding/terms.functions";
import { needsTermsAcceptance } from "@/features/onboarding/terms-gate";
import { errorMessage } from "@/lib/errors";

const acceptTermsSearchSchema = z.object({ redirect: internalPathSchema });

/** Item 26.a (L4): accepting the terms in force, for the Google sign-up and new versions. */
export const Route = createFileRoute("/aceitar-termos")({
  validateSearch: acceptTermsSearchSchema,
  head: () => ({ meta: [{ title: "Termos de uso | SellBridge" }] }),
  beforeLoad: async ({ search, location }) => {
    const session = await getAppSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    if (!needsTermsAcceptance(session)) {
      throw redirect({ to: search.redirect ?? "/dashboard" });
    }
  },
  component: AcceptTermsPage,
});

const MUST_ACCEPT_MESSAGE = "Marque que você aceita os termos para continuar.";

function useAcceptTerms() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  async function submit() {
    if (!accepted) {
      setError(MUST_ACCEPT_MESSAGE);
      return;
    }
    setIsPending(true);
    setError(null);
    try {
      await acceptTermsFn({ data: { version: TERMS_VERSION } });
      await router.invalidate();
      await navigate({ to: search.redirect ?? "/dashboard" });
    } catch (failure) {
      setError(errorMessage(failure));
      setIsPending(false);
    }
  }
  return { accepted, setAccepted, error, isPending, submit };
}

function AcceptTermsPage() {
  const { accepted, setAccepted, error, isPending, submit } = useAcceptTerms();
  return (
    <AuthShell>
      <div className="space-y-8">
        <AuthPageHeader
          title="Antes de continuar"
          description="Leia e aceite os termos de uso e a política de privacidade do SellBridge."
        />
        <form noValidate className="grid gap-4" onSubmit={submitHandler(submit)}>
          <TermsConsentCheckbox
            checked={accepted}
            invalid={error === MUST_ACCEPT_MESSAGE}
            onCheckedChange={setAccepted}
          />
          <AuthSubmitButton isPending={isPending} idleLabel="Continuar" pendingLabel="Salvando…" />
          <InlineFormError message={error} />
        </form>
      </div>
    </AuthShell>
  );
}
