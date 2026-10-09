import { formatCep, normalizeCep } from "@sellbridge/shared/cep";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { TextField } from "@/components/form/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantRegion, updateTenantRegion } from "@/features/region/region.functions";
import { errorMessage } from "@/lib/errors";

const onboardingSearchSchema = z.object({
  redirect: z.string().startsWith("/").optional().catch(undefined),
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

function OnboardingPage() {
  const region = Route.useLoaderData();
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
      await navigate({ to: search.redirect ?? "/fornecedores" });
    },
  });

  return (
    <div className="mx-auto w-full max-w-lg py-6">
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10">
            <MapPin className="size-5 text-primary" aria-hidden="true" />
          </div>
          <CardTitle>
            <h1>{region ? "Alterar sua região" : "Onde você está?"}</h1>
          </CardTitle>
          <CardDescription>
            Usamos seu CEP para mostrar fornecedores que entregam na sua região.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {region ? (
            <p className="text-sm text-muted-foreground">
              Região atual:{" "}
              <span className="font-medium text-foreground">
                {region.city} - {region.state}
              </span>
            </p>
          ) : null}
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
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Consultando CEP..." : "Salvar região"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
