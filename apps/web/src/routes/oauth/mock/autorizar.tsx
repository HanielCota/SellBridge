import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { TextField } from "@/components/form/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAppSession } from "@/features/auth/session.functions";
import { approveMockAuthorization } from "@/features/stores/stores.functions";
import { errorMessage } from "@/lib/errors";

const consentSearchSchema = z.object({
  state: z.string().min(1),
  redirect_uri: z.url(),
});

export const Route = createFileRoute("/oauth/mock/autorizar")({
  validateSearch: consentSearchSchema,
  beforeLoad: async ({ location }) => {
    const session = await getAppSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  head: () => ({ meta: [{ title: "Autorizar acesso | Loja simulada" }] }),
  component: MockConsentPage,
});

const shopFormSchema = z.object({
  shopName: z.string().trim().min(3, "Informe o nome da loja"),
});

function MockConsentPage() {
  const search = Route.useSearch();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { shopName: "" },
    validators: { onSubmit: shopFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const result = await approveMockAuthorization({
          data: { shopName: value.shopName, state: search.state, redirectUri: search.redirect_uri },
        });
        window.location.assign(result.redirectTo);
      } catch (error) {
        setSubmitError(errorMessage(error));
      }
    },
  });

  function deny() {
    const url = new URL(search.redirect_uri);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("state", search.state);
    window.location.assign(url.toString());
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <FlaskConical className="size-4" aria-hidden="true" />
            Marketplace simulado
          </div>
          <CardTitle>
            <h1>Autorizar o SellBridge</h1>
          </CardTitle>
          <CardDescription>
            O SellBridge quer publicar anúncios e ler pedidos da sua loja. Esta tela simula o
            consentimento de um marketplace real.
          </CardDescription>
        </CardHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              {[
                "Publicar e editar anúncios",
                "Atualizar estoque e preço",
                "Ler pedidos e vendas",
              ].map((permission) => (
                <li key={permission} className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                  {permission}
                </li>
              ))}
            </ul>
            {submitError ? (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            ) : null}
            <form.Field name="shopName">
              {(field) => (
                <TextField
                  id="shopName"
                  label="Nome da loja"
                  placeholder="Ex.: Loja da Ana"
                  value={field.state.value}
                  errors={field.state.meta.errors}
                  onBlur={field.handleBlur}
                  onValueChange={field.handleChange}
                />
              )}
            </form.Field>
          </CardContent>
          <CardFooter className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={deny}>
              Cancelar
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Autorizando..." : "Autorizar acesso"}
                </Button>
              )}
            </form.Subscribe>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
