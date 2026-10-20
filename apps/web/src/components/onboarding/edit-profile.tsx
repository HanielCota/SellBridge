import type { BillingHolder, OnboardingProfile } from "@sellbridge/database/repositories";
import { PRODUCT_SOURCE_LABELS } from "@sellbridge/shared/product-sources";
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
        title="Setup settings"
        description="Review your details and product sources at any time."
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="holder-data"
          className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-6"
        >
          <h2 id="holder-data" className="text-subhead font-semibold">
            Your details
          </h2>
          <HolderForm
            holder={holder}
            submitLabel={savedHolder ? "Details saved" : "Save details"}
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
          Your product sources
        </h2>
        <p className="text-sm text-muted-foreground">
          {PRODUCT_SOURCE_LABELS[profile.productSourceMode ?? "suppliers"]}
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
        Changes apply to future setup. Existing stores, listings, and orders keep their current
        settings.
      </p>
      <Button asChild variant="outline">
        <Link to="/onboarding" search={{ step: "supplier" }}>
          Edit product sources
        </Link>
      </Button>
    </section>
  );
}
