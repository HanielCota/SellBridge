import type { OnboardingProfile } from "@sellbridge/database/repositories";
import { internalPathSchema } from "@sellbridge/shared/schemas";
import { isProductSourceSetupComplete } from "@sellbridge/shared/product-sources";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { HolderForm } from "@/components/onboarding/holder-form";
import { ProductSourceChoice } from "@/components/onboarding/product-source-choice";
import { EditOnboardingProfile } from "@/components/onboarding/edit-profile";
import { StepProgress } from "@/components/region/billing-holder";
import { Button } from "@/components/ui/button";
import { getOnboardingProfile } from "@/features/onboarding/onboarding.functions";
import { SETUP_STEPS } from "@/features/onboarding/setup-progress";
import { setupProgressQueryOptions } from "@/features/reports/reports.queries";

const onboardingSearchSchema = z.object({
  redirect: internalPathSchema,
  step: z.enum(["details", "supplier"]).optional(),
});

export const Route = createFileRoute("/_app/onboarding")({
  validateSearch: onboardingSearchSchema,
  head: () => ({ meta: [{ title: "Meu cadastro | SellBridge" }] }),
  loader: () => getOnboardingProfile(),
  component: OnboardingPage,
});

const SIGNUP_STEPS = [{ title: "Seus dados" }, { title: "Origem dos produtos" }] as const;

/** Minutes of the two steps of this page, from the setup estimates (item 26.c). */
const SIGNUP_MINUTES = SETUP_STEPS.filter(
  (step) => step.key === "hasHolder" || step.key === "hasSupplier",
).reduce((total, step) => total + step.estimatedMinutes, 0);

function OnboardingPage() {
  const profile = Route.useLoaderData();
  const { step } = Route.useSearch();
  if (step !== undefined) {
    return <OnboardingStepEditor key={step} step={step} profile={profile} />;
  }
  if (
    profile.holder !== null &&
    isProductSourceSetupComplete(
      profile.productSourceMode,
      profile.starterSupplier?.active === true,
    )
  ) {
    return <EditOnboardingProfile holder={profile.holder} profile={profile} />;
  }
  return <FirstVisit profile={profile} />;
}

/** Each dashboard card opens its own editable step, including a partially completed setup. */
function OnboardingStepEditor({
  step,
  profile,
}: {
  step: "details" | "supplier";
  profile: OnboardingProfile;
}) {
  const finish = useFinishOnboarding();
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button asChild variant="ghost">
        <Link to="/dashboard">
          <ArrowLeftIcon aria-hidden="true" />
          Voltar ao painel
        </Link>
      </Button>
      <PageHeader
        title={step === "details" ? "Seus dados" : "Origem dos seus produtos"}
        description="Confira os dados salvos. Você pode voltar e editar quando quiser."
      />
      <section className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-8">
        {step === "details" ? (
          <HolderForm
            holder={profile.holder}
            submitLabel={saved ? "Dados salvos" : "Salvar dados"}
            onSaved={async () => {
              await router.invalidate();
              setSaved(true);
            }}
          />
        ) : (
          <ProductSourceChoice
            profile={profile}
            onSaved={finish}
            onBack={() => {
              void navigate({ to: "/dashboard" });
            }}
          />
        )}
      </section>
    </div>
  );
}

/** After saving, the next setup step: the stores while there is none, else the catalog. */
function useFinishOnboarding() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  return async function finish() {
    await router.invalidate();
    const progress = await queryClient.fetchQuery({ ...setupProgressQueryOptions(), staleTime: 0 });
    await navigate({
      to:
        search.redirect ??
        (search.step
          ? "/dashboard"
          : progress.hasStore
            ? progress.productSourceMode === "own"
              ? "/products"
              : "/catalogo"
            : "/lojas"),
    });
  };
}

/**
 * Saves the holder and product sources independently so returning resumes the unfinished step.
 */
function FirstVisit({ profile }: { profile: OnboardingProfile }) {
  const finish = useFinishOnboarding();
  const [step, setStep] = useState(profile.holder === null ? 0 : 1);
  const [holder, setHolder] = useState(profile.holder);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Configure sua conta"
        description={`Salve seus dados e escolha a origem dos produtos em cerca de ${SIGNUP_MINUTES} minutos.`}
      />
      <section
        aria-label="Cadastro"
        className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-8"
      >
        <StepProgress steps={SIGNUP_STEPS} current={step} />
        {step === 0 ? (
          <HolderForm
            holder={holder}
            submitLabel="Continuar"
            onSaved={(saved) => {
              setHolder(saved);
              setStep(1);
            }}
          />
        ) : (
          <ProductSourceChoice profile={profile} onSaved={finish} onBack={() => setStep(0)} />
        )}
      </section>
    </div>
  );
}
