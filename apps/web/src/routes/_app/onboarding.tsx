import { formatCep, normalizeCep } from "@sellbridge/shared/cep";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { optionalParameter } from "@sellbridge/shared/schemas";
import { TextField } from "@/components/form/form-field";
import { CurrentRegionCard } from "@/components/region/current-region-card";
import { RegionPreview } from "@/components/region/region-preview";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getRegionOverview, updateTenantRegion } from "@/features/region/region.functions";
import { setupProgressQueryOptions } from "@/features/reports/reports.queries";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const onboardingSearchSchema = z.object({
  redirect: optionalParameter(z.string().startsWith("/")),
});

const cepFormSchema = z.object({
  cep: z.string().refine((value) => normalizeCep(value) !== null, "Informe um CEP com 8 dígitos"),
});

export const Route = createFileRoute("/_app/onboarding")({
  validateSearch: onboardingSearchSchema,
  head: () => ({ meta: [{ title: "Sua região | SellBridge" }] }),
  loader: () => getRegionOverview(),
  component: OnboardingPage,
});

function maskCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

type TenantRegion = Awaited<ReturnType<typeof getRegionOverview>>["region"];

function ChangeRegionCard({ region }: { readonly region: TenantRegion }) {
  return (
    <section
      aria-labelledby={region ? "change-region" : undefined}
      className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-6"
    >
      {region ? (
        <div className="space-y-1">
          <h2 id="change-region" className="text-subhead font-semibold">
            Trocar região
          </h2>
          <p className="text-sm text-muted-foreground">
            Digite o novo CEP e veja o que muda no seu catálogo antes de salvar.
          </p>
        </div>
      ) : null}
      <RegionForm region={region} />
    </section>
  );
}

function OnboardingPage() {
  const { region, suppliers } = Route.useLoaderData();
  return (
    // Without a region there is nothing to compare, so the form stays a single narrow column.
    <div className={cn("mx-auto w-full space-y-6", region ? "max-w-5xl" : "max-w-2xl")}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {region ? "Alterar sua região" : "Onde você está?"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Usamos seu CEP para mostrar só fornecedores que entregam na sua região.
        </p>
      </div>
      {region ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <CurrentRegionCard region={region} suppliers={suppliers} />
          {/* Sticky so the preview stays beside the supplier list while scrolling. */}
          <div className="lg:sticky lg:top-24">
            <ChangeRegionCard region={region} />
          </div>
        </div>
      ) : (
        <ChangeRegionCard region={null} />
      )}
    </div>
  );
}

function useRegionForm(region: TenantRegion) {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { cep: region ? formatCep(region.cep) : "" },
    validators: { onSubmit: cepFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await updateTenantRegion({ data: { cep: value.cep } });
      } catch (error) {
        setSubmitError(errorMessage(error));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      // Impact previews were computed against the old region.
      queryClient.removeQueries({ queryKey: ["region", "preview"] });
      await router.invalidate();
      const progress = await queryClient.fetchQuery({
        ...setupProgressQueryOptions(),
        staleTime: 0,
      });
      await navigate({ to: search.redirect ?? (progress.hasStore ? "/catalogo" : "/lojas") });
    },
  });
  return { form, submitError };
}

function RegionForm({ region }: { readonly region: TenantRegion }) {
  const { form, submitError } = useRegionForm(region);
  return (
    <>
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
        <form.Field name="cep">
          {(field) => (
            <TextField
              id="cep"
              label="CEP"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              value={field.state.value}
              errors={field.state.meta.errors}
              onBlur={field.handleBlur}
              onValueChange={(value) => field.handleChange(maskCep(value))}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => normalizeCep(state.values.cep)}>
          {(cep) =>
            // The saved CEP needs no preview; any other complete CEP shows what would change.
            cep && cep !== region?.cep ? (
              <RegionPreview cep={cep} hasRegion={region !== null} />
            ) : null
          }
        </form.Subscribe>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting} className="justify-self-start">
              {isSubmitting ? "Consultando CEP..." : "Salvar região"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </>
  );
}
