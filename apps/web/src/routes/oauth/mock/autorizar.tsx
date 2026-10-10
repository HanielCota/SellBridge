import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowsClockwiseIcon, FlaskIcon, MegaphoneIcon, ReceiptIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { z } from "zod";
import { fieldBindings, submitHandler } from "@/components/form/form-bindings";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { BrandIcon } from "@/components/brand/brand-logo";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
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

const REQUESTED_PERMISSIONS = [
  {
    icon: MegaphoneIcon,
    title: "Publicar e editar anúncios",
    text: "Criar anúncios com os produtos dos fornecedores que você escolher.",
  },
  {
    icon: ArrowsClockwiseIcon,
    title: "Atualizar estoque e preço",
    text: "Manter o anúncio igual ao estoque do fornecedor e ao seu preço.",
  },
  {
    icon: ReceiptIcon,
    title: "Ler pedidos e vendas",
    text: "Trazer cada venda para o seu financeiro.",
  },
] as const;

type ConsentSearch = z.infer<typeof consentSearchSchema>;

function denyAuthorization(search: ConsentSearch) {
  const url = new URL(search.redirect_uri);
  url.searchParams.set("error", "access_denied");
  url.searchParams.set("state", search.state);
  window.location.assign(url.toString());
}

function useConsentForm(search: ConsentSearch) {
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

  return { form, submitError };
}

function ConsentHeader() {
  return (
    <header className="space-y-6 text-center">
      <div className="flex items-center justify-center gap-4" aria-hidden="true">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <BrandIcon className="size-7" />
        </span>
        <MarketplaceMark marketplace="mock" className="size-14 rounded-2xl" />
      </div>
      <div className="space-y-2">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <FlaskIcon className="size-3.5" aria-hidden="true" />
          Marketplace simulado · ambiente de teste
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Autorizar o SellBridge</h1>
        <p className="text-sm text-muted-foreground">
          O SellBridge vai poder fazer o seguinte na sua loja:
        </p>
      </div>
    </header>
  );
}

function PermissionList() {
  return (
    <ul className="surface-card divide-y divide-border rounded-2xl bg-muted/50">
      {REQUESTED_PERMISSIONS.map((permission) => (
        <li key={permission.title} className="flex gap-3 p-4">
          <permission.icon className="mt-0.5 size-5 shrink-0 text-brand-text" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{permission.title}</p>
            <p className="text-xs text-muted-foreground">{permission.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ConsentForm({ search }: { search: ConsentSearch }) {
  const { form, submitError } = useConsentForm(search);

  return (
    <form noValidate onSubmit={submitHandler(() => form.handleSubmit())} className="space-y-6">
      <PermissionList />
      <FormErrorAlert message={submitError} />
      <form.Field name="shopName">
        {(field) => (
          <TextField
            id="shopName"
            label="Nome da loja"
            placeholder="Ex.: Loja da Ana"
            {...fieldBindings(field)}
          />
        )}
      </form.Field>
      <div className="space-y-2">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <PendingSubmitButton
              isPending={isSubmitting}
              idleLabel="Autorizar acesso"
              pendingLabel="Autorizando..."
              className="h-11 w-full text-subhead"
            />
          )}
        </form.Subscribe>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full"
          onClick={() => denyAuthorization(search)}
        >
          Cancelar
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Você pode desconectar a loja quando quiser, na página Lojas.
      </p>
    </form>
  );
}

function MockConsentPage() {
  const search = Route.useSearch();

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="surface-card w-full max-w-md space-y-8 rounded-3xl bg-card p-6 sm:p-8">
        <ConsentHeader />
        <ConsentForm search={search} />
      </div>
    </main>
  );
}
