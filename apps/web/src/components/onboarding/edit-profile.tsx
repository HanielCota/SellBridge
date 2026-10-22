import type { BillingHolder, OnboardingProfile } from "@sellbridge/database/repositories";
import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { HolderForm } from "@/components/onboarding/holder-form";
import { SupplierLogo } from "@/components/suppliers/supplier-logo";
import { Button } from "@/components/ui/button";

export function EditOnboardingProfile({
  holder,
  profile,
}: {
  holder: BillingHolder;
  profile: OnboardingProfile;
}) {
  const router = useRouter();
  const [savedHolder, setSavedHolder] = useState(false);
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Meu cadastro"
        description="Confira seus dados e o fornecedor dos seus produtos quando quiser."
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
            onSaved={async () => {
              await router.invalidate();
              setSavedHolder(true);
            }}
          />
        </section>
        <ProductSourceSummary profile={profile} />
      </div>
    </div>
  );
}

function ProductSourceSummary({ profile }: { profile: OnboardingProfile }) {
  const supplier = profile.starterSupplier;
  return (
    <section
      aria-labelledby="product-sources"
      className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="space-y-1">
        <h2 id="product-sources" className="text-subhead font-semibold">
          Seu fornecedor
        </h2>
        <p className="text-sm text-muted-foreground">
          {supplier === null
            ? "Você ainda não escolheu um fornecedor."
            : "Quem guarda o estoque e envia os produtos da sua próxima loja."}
        </p>
      </div>
      {supplier === null ? null : (
        <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4">
          <SupplierLogo name={supplier.name} logoUrl={supplier.logoUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{supplier.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {supplier.niche} · {supplier.city} - {supplier.state}
            </p>
          </div>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        As alterações valem para as próximas configurações. Lojas, anúncios e pedidos existentes
        mantêm as configurações atuais.
      </p>
      <Button asChild variant="outline">
        <Link to="/onboarding" search={{ step: "supplier" }}>
          {supplier === null ? "Escolher fornecedor" : "Trocar fornecedor"}
        </Link>
      </Button>
    </section>
  );
}
