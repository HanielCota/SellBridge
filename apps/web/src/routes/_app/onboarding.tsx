import { formatCep, normalizeCep } from "@sellbridge/shared/cep";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { MapPinIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { z } from "zod";
import { optionalParameter } from "@sellbridge/shared/schemas";
import { TextField } from "@/components/form/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTenantRegion, updateTenantRegion } from "@/features/region/region.functions";
import { setupProgressQueryOptions } from "@/features/reports/reports.queries";
import { errorMessage } from "@/lib/errors";

const onboardingSearchSchema = z.object({
  redirect: optionalParameter(z.string().startsWith("/")),
});

const cepFormSchema = z.object({
  cep: z.string().refine((value) => normalizeCep(value) !== null, "Informe um CEP com 8 dígitos"),
});

export const Route = createFileRoute("/_app/onboarding")({
  validateSearch: onboardingSearchSchema,
  head: () => ({ meta: [{ title: "Sua região | SellBridge" }] }),
  loader: () => getTenantRegion(),
  component: OnboardingPage,
});

function maskCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

type TenantRegion = Awaited<ReturnType<typeof getTenantRegion>>;

function OnboardingPage() {
  const region = Route.useLoaderData();
  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          {region ? "Alterar sua região" : "Onde você está?"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Usamos seu CEP para mostrar só fornecedores que entregam na sua região.
        </p>
      </div>
      <Card>
        <CardContent className="space-y-5">
          {region ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPinIcon className="size-4" aria-hidden="true" />
              Região atual:
              <span className="font-medium text-foreground">
                {region.city} - {region.state}
              </span>
            </p>
          ) : null}
          <RegionForm region={region} />
        </CardContent>
      </Card>
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
