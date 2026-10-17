import type { BillingHolder, OnboardingProfile } from "@sellbridge/database/repositories";
import { internalPathSchema } from "@sellbridge/shared/schemas";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { HolderForm } from "@/components/onboarding/holder-form";
import { type PickableSupplier, SupplierPicker } from "@/components/onboarding/supplier-picker";
import { StepProgress } from "@/components/region/billing-holder";
import { SupplierLogo } from "@/components/suppliers/supplier-logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  getOnboardingProfile,
  saveOnboardingSupplier,
} from "@/features/onboarding/onboarding.functions";
import { SETUP_STEPS } from "@/features/onboarding/setup-progress";
import { setupProgressQueryOptions } from "@/features/reports/reports.queries";
import { errorMessage } from "@/lib/errors";

const onboardingSearchSchema = z.object({
  redirect: internalPathSchema,
});

export const Route = createFileRoute("/_app/onboarding")({
  validateSearch: onboardingSearchSchema,
  head: () => ({ meta: [{ title: "Seus dados | SellBridge" }] }),
  loader: () => getOnboardingProfile(),
  component: OnboardingPage,
});

const SIGNUP_STEPS = [{ title: "Seus dados" }, { title: "Seu fornecedor" }] as const;

/** Minutes of the two steps of this page, from the setup estimates (item 26.c). */
const SIGNUP_MINUTES = SETUP_STEPS.filter(
  (step) => step.key === "hasHolder" || step.key === "hasSupplier",
).reduce((total, step) => total + step.estimatedMinutes, 0);

function OnboardingPage() {
  const profile = Route.useLoaderData();
  if (profile.holder !== null && profile.starterSupplier !== null) {
    return <EditProfile holder={profile.holder} supplier={profile.starterSupplier} />;
  }
  return <FirstVisit profile={profile} />;
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
    await navigate({ to: search.redirect ?? (progress.hasStore ? "/catalogo" : "/lojas") });
  };
}

/**
 * A new account fills two short steps: who invoices go to (name and CPF), then the supplier the
 * first shop sells, from anywhere in Brazil. Each step saves on its own, so a CPF already in use
 * is refused right away and coming back later resumes where the account stopped.
 */
function FirstVisit({ profile }: { profile: OnboardingProfile }) {
  const [step, setStep] = useState(profile.holder === null ? 0 : 1);
  const [holder, setHolder] = useState(profile.holder);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Seu cadastro"
        description={`Seus dados e o fornecedor da sua primeira loja, em cerca de ${SIGNUP_MINUTES} min. Venda sem estoque, de qualquer lugar do Brasil.`}
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
          <SupplierStep
            initialSupplierId={profile.starterSupplier?.id ?? null}
            onBack={() => setStep(0)}
          />
        )}
      </section>
    </div>
  );
}

/** Saves the picked supplier; `onSaved` runs only when it was stored. */
function useSaveSupplier(onSaved: () => Promise<void>) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(supplierId: string) {
    setError(null);
    setIsSaving(true);
    try {
      await saveOnboardingSupplier({ data: { supplierId } });
    } catch (caught) {
      setError(errorMessage(caught));
      setIsSaving(false);
      return;
    }
    setIsSaved(true);
    await onSaved();
  }
  return { save, isSaving, isSaved, error };
}

function SupplierStep({
  initialSupplierId,
  onBack,
}: {
  initialSupplierId: string | null;
  onBack: () => void;
}) {
  const finish = useFinishOnboarding();
  const [picked, setPicked] = useState<PickableSupplier | null>(null);
  const saving = useSaveSupplier(finish);
  const pickedId = picked?.id ?? initialSupplierId;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5">
      <div className="space-y-1">
        <h2 className="text-subhead font-semibold">Escolha seu fornecedor</h2>
        <p className="text-sm text-muted-foreground">
          Ele vende pela sua primeira loja e entrega direto ao seu cliente. Para vender de outro
          fornecedor, conecte outra loja depois.
        </p>
      </div>
      <SupplierPicker value={pickedId} onChange={setPicked} />
      {saving.error ? (
        <Alert variant="destructive">
          <AlertDescription>{saving.error}</AlertDescription>
        </Alert>
      ) : null}
      {/* Pinned while the supplier list scrolls, so the choice can be confirmed from anywhere. */}
      <div className="sticky bottom-3 z-10 -mx-2 flex items-center gap-2 rounded-3xl bg-card/80 p-2 backdrop-blur-xl backdrop-saturate-150 contrast-more:bg-card">
        <Button type="button" variant="ghost" size="lg" onClick={onBack}>
          <ArrowLeftIcon aria-hidden="true" />
          Voltar
        </Button>
        <ContinueButton
          supplierName={picked?.name ?? null}
          disabled={pickedId === null || saving.isSaving || saving.isSaved}
          isSaving={saving.isSaving}
          isSaved={saving.isSaved}
          onClick={() => {
            if (pickedId !== null) {
              void saving.save(pickedId);
            }
          }}
        />
      </div>
    </div>
  );
}

function ContinueButton({
  supplierName,
  disabled,
  isSaving,
  isSaved,
  onClick,
}: {
  supplierName: string | null;
  disabled: boolean;
  isSaving: boolean;
  isSaved: boolean;
  onClick: () => void;
}) {
  if (isSaved) {
    return (
      <Button type="button" size="lg" disabled className="min-w-0 flex-1 sm:flex-none">
        <CheckIcon
          weight="bold"
          className="animate-in duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] zoom-in-50 motion-reduce:zoom-in-100"
          aria-hidden="true"
        />
        Fornecedor salvo
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="lg"
      disabled={disabled}
      onClick={onClick}
      className="min-w-0 flex-1 sm:flex-none"
    >
      {isSaving ? "Salvando…" : null}
      {/* Phones keep it short; the picked card already shows the name. */}
      {!isSaving && supplierName !== null ? (
        <>
          <span className="sm:hidden">Continuar</span>
          <span className="hidden truncate sm:inline">Continuar com {supplierName}</span>
        </>
      ) : null}
      {!isSaving && supplierName === null ? "Continuar" : null}
      {isSaving ? null : <ArrowRightIcon aria-hidden="true" />}
    </Button>
  );
}

/** Both steps done: change the holder data or the supplier of the first shop, side by side. */
function EditProfile({
  holder,
  supplier,
}: {
  holder: BillingHolder;
  supplier: NonNullable<OnboardingProfile["starterSupplier"]>;
}) {
  const router = useRouter();
  const [savedHolder, setSavedHolder] = useState(false);
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Alterar seus dados"
        description="Seus dados de cobrança e o fornecedor escolhido no cadastro."
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="holder-data"
          className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-6"
        >
          <h2 id="holder-data" className="text-subhead font-semibold">
            Seus dados
          </h2>
          <HolderForm
            holder={holder}
            submitLabel={savedHolder ? "Dados salvos" : "Salvar dados"}
            onSaved={() => {
              setSavedHolder(true);
              void router.invalidate();
            }}
          />
        </section>
        <StarterSupplierCard supplier={supplier} />
      </div>
    </div>
  );
}

function StarterSupplierCard({
  supplier,
}: {
  supplier: NonNullable<OnboardingProfile["starterSupplier"]>;
}) {
  const [isChanging, setIsChanging] = useState(false);
  return (
    <section
      aria-labelledby="starter-supplier"
      className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="space-y-1">
        <h2 id="starter-supplier" className="text-subhead font-semibold">
          Fornecedor escolhido no cadastro
        </h2>
        <p className="text-sm text-muted-foreground">
          A primeira loja que você conectar vende os produtos dele.
        </p>
      </div>
      <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4">
        <SupplierLogo name={supplier.name} logoUrl={supplier.logoUrl} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{supplier.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {supplier.niche} · {supplier.city} - {supplier.state}
          </p>
        </div>
      </div>
      {isChanging ? (
        <SupplierChange currentId={supplier.id} onDone={() => setIsChanging(false)} />
      ) : (
        <Button type="button" variant="outline" onClick={() => setIsChanging(true)}>
          Trocar fornecedor
        </Button>
      )}
    </section>
  );
}

/** Picks another starter supplier; saving or cancelling closes the picker. */
function SupplierChange({ currentId, onDone }: { currentId: string; onDone: () => void }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const saving = useSaveSupplier(async () => {
    await router.invalidate();
    onDone();
  });
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <SupplierPicker value={picked ?? currentId} onChange={(next) => setPicked(next.id)} />
      {saving.error ? (
        <Alert variant="destructive">
          <AlertDescription>{saving.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={picked === null || picked === currentId || saving.isSaving}
          onClick={() => {
            if (picked !== null) {
              void saving.save(picked);
            }
          }}
        >
          {saving.isSaving ? "Salvando…" : "Salvar fornecedor"}
        </Button>
      </div>
    </div>
  );
}
