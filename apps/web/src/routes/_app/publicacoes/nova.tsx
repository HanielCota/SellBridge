import { formatCents, parseBrlToCents } from "@sellbridge/shared/money";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { firstErrorMessage, TextField } from "@/components/form/form-field";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { createListing, getNewListingData } from "@/features/listings/listings.functions";
import { newListingQueryOptions } from "@/features/listings/listings.queries";
import { estimateProfit } from "@/features/listings/profit";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/publicacoes/nova")({
  validateSearch: z.object({ productId: z.uuid() }),
  loaderDeps: ({ search }) => ({ productId: search.productId }),
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, newListingQueryOptions(search.productId)),
  head: () => ({ meta: [{ title: "Nova publicação | SellBridge" }] }),
  component: NewListingPage,
});

function NewListingPage() {
  const { productId } = Route.useSearch();
  const query = useQuery(newListingQueryOptions(productId));

  if (query.isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Carregando produto">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const { product, stores } = query.data;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/fornecedores/$supplierId" params={{ supplierId: product.supplierId }}>
          <ArrowLeft aria-hidden="true" />
          {product.supplierName}
        </Link>
      </Button>
      <PageHeader
        title="Nova publicação"
        description="Revise o anúncio e escolha em quais lojas ele será publicado."
      />
      {stores.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Conecte uma loja antes de publicar"
          description="Você ainda não tem lojas conectadas. Conecte uma loja para publicar este produto."
          action={
            <Button asChild>
              <Link to="/lojas">Conectar loja</Link>
            </Button>
          }
        />
      ) : (
        <ListingForm product={product} stores={stores} />
      )}
    </>
  );
}

type NewListingData = Awaited<ReturnType<typeof getNewListingData>>;

const listingFormSchema = z.object({
  title: z.string().trim().min(10, "O título deve ter ao menos 10 caracteres").max(120),
  description: z.string().trim().min(20, "Descreva o produto com ao menos 20 caracteres"),
  price: z.string().refine((value) => (parseBrlToCents(value) ?? 0) > 0, "Informe um preço válido"),
  storeConnectionIds: z.array(z.string()).min(1, "Escolha ao menos uma loja de destino"),
});

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

type ListingProduct = NewListingData["product"];
type ListingStore = NewListingData["stores"][number];
type ListingFormValues = z.infer<typeof listingFormSchema>;

function successMessage(targetCount: number): string {
  return targetCount > 1
    ? `Publicação enviada para ${targetCount} lojas`
    : "Publicação enviada para a fila";
}

function useListingForm({ product, stores }: Pick<NewListingData, "product" | "stores">) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function submit(value: ListingFormValues) {
    setSubmitError(null);
    const priceCents = parseBrlToCents(value.price);
    if (priceCents === null) {
      setSubmitError("Informe um preço válido");
      return;
    }
    try {
      const created = await createListing({
        data: {
          supplierProductId: product.id,
          title: value.title,
          description: value.description,
          priceCents,
          storeConnectionIds: value.storeConnectionIds,
        },
      });
      toast.success(successMessage(created.targetIds.length));
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
      await navigate({ to: "/publicacoes" });
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  }

  const form = useForm({
    defaultValues: {
      title: product.title,
      description: product.description,
      price: centsToInput(product.suggestedPriceCents),
      storeConnectionIds: stores.length === 1 ? stores.map((store) => store.id) : ([] as string[]),
    },
    validators: { onSubmit: listingFormSchema },
    onSubmit: ({ value }) => submit(value),
  });
  return { form, submitError };
}

type ListingFormApi = ReturnType<typeof useListingForm>["form"];

function ListingForm({ product, stores }: Pick<NewListingData, "product" | "stores">) {
  const { form, submitError } = useListingForm({ product, stores });
  return (
    <form
      noValidate
      className="grid gap-6 lg:grid-cols-[1fr_320px]"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <ListingFieldsCard form={form} stores={stores} submitError={submitError} />
      <ListingSidebar form={form} product={product} />
    </form>
  );
}

function ListingFieldsCard({
  form,
  stores,
  submitError,
}: {
  readonly form: ListingFormApi;
  readonly stores: readonly ListingStore[];
  readonly submitError: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Anúncio</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
        <ListingTextFields form={form} />
        <form.Field name="storeConnectionIds">
          {(field) => (
            <StoreSelection
              stores={stores}
              selectedIds={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
      </CardContent>
    </Card>
  );
}

function ListingTextFields({ form }: { readonly form: ListingFormApi }) {
  return (
    <>
      <form.Field name="title">
        {(field) => (
          <TextField
            id="title"
            label="Título"
            value={field.state.value}
            errors={field.state.meta.errors}
            onBlur={field.handleBlur}
            onValueChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <DescriptionField
            value={field.state.value}
            errors={field.state.meta.errors}
            onBlur={field.handleBlur}
            onValueChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="price">
        {(field) => (
          <TextField
            id="price"
            label="Preço de venda (R$)"
            inputMode="decimal"
            value={field.state.value}
            errors={field.state.meta.errors}
            onBlur={field.handleBlur}
            onValueChange={field.handleChange}
          />
        )}
      </form.Field>
    </>
  );
}

interface FieldControlProps<TValue> {
  readonly value: TValue;
  readonly errors: readonly unknown[];
  readonly onBlur: () => void;
  readonly onValueChange: (value: TValue) => void;
}

function DescriptionField({ value, errors, onBlur, onValueChange }: FieldControlProps<string>) {
  const message = firstErrorMessage(errors);
  return (
    <div className="grid gap-2">
      <Label htmlFor="description">Descrição</Label>
      <Textarea
        id="description"
        rows={6}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? "description-error" : undefined}
      />
      {message ? (
        <p id="description-error" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function StoreSelection({
  stores,
  selectedIds,
  errors,
  onChange,
}: {
  readonly stores: readonly ListingStore[];
  readonly selectedIds: readonly string[];
  readonly errors: readonly unknown[];
  readonly onChange: (storeConnectionIds: string[]) => void;
}) {
  const message = firstErrorMessage(errors);
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Lojas de destino</legend>
      {stores.map((store) => (
        <div key={store.id} className="flex items-center gap-2">
          <Checkbox
            id={`store-${store.id}`}
            checked={selectedIds.includes(store.id)}
            onCheckedChange={(next) =>
              onChange(
                next === true
                  ? [...selectedIds, store.id]
                  : selectedIds.filter((id) => id !== store.id),
              )
            }
          />
          <Label htmlFor={`store-${store.id}`} className="font-normal">
            {store.shopName}
          </Label>
        </div>
      ))}
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </fieldset>
  );
}

function ListingSidebar({
  form,
  product,
}: {
  readonly form: ListingFormApi;
  readonly product: ListingProduct;
}) {
  return (
    <div className="space-y-4">
      <form.Subscribe selector={(state) => state.values.price}>
        {(price) => <ProfitCard priceCents={parseBrlToCents(price)} product={product} />}
      </form.Subscribe>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Publicar"}
          </Button>
        )}
      </form.Subscribe>
    </div>
  );
}

function ProfitCard({
  priceCents,
  product,
}: {
  priceCents: number | null;
  product: NewListingData["product"];
}) {
  const estimate = estimateProfit(priceCents, product.costCents);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Estimativa por venda</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Preço de venda</dt>
          <dd className="text-right">{priceCents === null ? "—" : formatCents(priceCents)}</dd>
          <dt className="text-muted-foreground">Custo do fornecedor</dt>
          <dd className="text-right">− {formatCents(product.costCents)}</dd>
          <dt className="text-muted-foreground">Taxa estimada (14%)</dt>
          <dd className="text-right">− {estimate ? formatCents(estimate.feeCents) : "—"}</dd>
          <dt className="border-t pt-2 font-medium">Lucro estimado</dt>
          <dd
            className={
              estimate && estimate.profitCents < 0
                ? "border-t pt-2 text-right font-semibold text-destructive"
                : "border-t pt-2 text-right font-semibold"
            }
          >
            {estimate ? formatCents(estimate.profitCents) : "—"}
          </dd>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          A taxa real depende do marketplace e da categoria do anúncio.
        </p>
      </CardContent>
    </Card>
  );
}
