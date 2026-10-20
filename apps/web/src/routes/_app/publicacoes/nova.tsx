import { formatCents, formatCentsForInput, parseBrlToCents } from "@sellbridge/shared/money";
import {
  LISTING_DESCRIPTION_MAX_LENGTH,
  LISTING_TITLE_MAX_LENGTH,
  listingDescriptionSchema,
  listingPriceCentsSchema,
  listingTitleSchema,
  optionalParameter,
} from "@sellbridge/shared/schemas";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowCounterClockwiseIcon, ArrowLeftIcon, StorefrontIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ToneStatus } from "@/components/data/tone-status";
import { firstErrorMessage, TextField } from "@/components/form/form-field";
import { TextareaField } from "@/components/form/textarea-field";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { ListingPreview, ProfitCard } from "@/components/listings/new-listing-cards";
import { profitTone } from "@/components/listings/profit-split";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createListing, getNewListingData } from "@/features/listings/listings.functions";
import { newListingQueryOptions } from "@/features/listings/listings.queries";
import { type FeeSchedule, priceFloorProblem } from "@sellbridge/shared/fee-model";
import {
  estimateProfit,
  isThinMargin,
  priceForMargin,
  type ProfitEstimate,
  wholeMarginPercent,
} from "@/features/listings/profit";
import { feeScheduleQueryOptions, useFeeSchedule } from "@/features/reports/fee-schedule.queries";
import { displayStoreName } from "@/features/stores/store-name";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { cn } from "@/lib/utils";
import { ACTION_ICONS, TERM_HINTS } from "@/components/icons/action-icons";
import { Hint, HintedText } from "@/components/ui/hint";

export const Route = createFileRoute("/_app/publicacoes/nova")({
  // A missing or malformed product id (a typed or stale URL) sends the reseller back to pick one.
  validateSearch: z.object({ productId: optionalParameter(z.uuid()) }),
  beforeLoad: ({ search }) => {
    if (!search.productId) {
      throw redirect({ to: "/catalogo" });
    }
    return { productId: search.productId };
  },
  loaderDeps: ({ search }) => ({ productId: search.productId }),
  loader: ({ context }) =>
    Promise.all([
      prefetchOnServer(context.queryClient, newListingQueryOptions(context.productId)),
      prefetchOnServer(context.queryClient, feeScheduleQueryOptions),
    ]),
  head: () => ({ meta: [{ title: "Nova publicação | SellBridge" }] }),
  component: NewListingPage,
});

const PublishIcon = ACTION_ICONS.publish.icon;

/** One-tap prices besides the supplier's suggestion, named by the margin they leave. */
const MARGIN_PRESETS = [30, 40, 50] as const;

function ProductBackLink({
  product,
}: {
  product: Awaited<ReturnType<typeof getNewListingData>>["product"];
}) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
      {product.catalogKind === "seller" ? (
        <Link to="/products" search={{ product: product.id }}>
          <ArrowLeftIcon aria-hidden="true" />
          My products
        </Link>
      ) : (
        <Link to="/fornecedores/$supplierId" params={{ supplierId: product.supplierId }}>
          <ArrowLeftIcon aria-hidden="true" />
          {product.supplierName}
        </Link>
      )}
    </Button>
  );
}

function NewListingPage() {
  const { productId } = Route.useRouteContext();
  const query = useQuery(newListingQueryOptions(productId));

  if (query.isPending) {
    return (
      <output className="block space-y-4" aria-busy="true" aria-label="Carregando produto">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-96 rounded-3xl" />
      </output>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const { product, stores, hasOtherStores } = query.data;
  return (
    <>
      <ProductBackLink product={product} />
      {stores.length === 0 ? (
        <>
          <PageHeader
            title="Nova publicação"
            description="Revise o anúncio e escolha em quais lojas ele será publicado."
          />
          <EmptyState
            icon={StorefrontIcon}
            title={
              hasOtherStores
                ? `Nenhuma loja vende ${product.supplierName}`
                : "Conecte uma loja antes de publicar"
            }
            description={
              hasOtherStores
                ? "Cada loja vende os produtos de um único fornecedor. Conecte uma loja para este fornecedor."
                : "Você ainda não tem lojas conectadas."
            }
            action={
              <Button asChild>
                <Link to="/lojas" search={{ fornecedor: product.supplierId }} hash="adicionar-loja">
                  {hasOtherStores ? "Conectar uma loja para este fornecedor" : "Conectar loja"}
                </Link>
              </Button>
            }
          />
        </>
      ) : (
        <ListingForm product={product} stores={stores} />
      )}
    </>
  );
}

type NewListingData = Awaited<ReturnType<typeof getNewListingData>>;

const listingFormSchema = z.object({
  title: listingTitleSchema,
  description: listingDescriptionSchema,
  price: z
    .string()
    .refine(
      (value) => listingPriceCentsSchema.safeParse(parseBrlToCents(value)).success,
      "Informe um preço entre R$ 0,01 e R$ 1.000.000,00",
    ),
  storeConnectionIds: z.array(z.string()).min(1, "Escolha ao menos uma loja de destino"),
});

type ListingProduct = NewListingData["product"];
type ListingStore = NewListingData["stores"][number];
type ListingFormValues = z.infer<typeof listingFormSchema>;

function pluralize(count: number, one: string, other: string): string {
  return `${count} ${count === 1 ? one : other}`;
}

function successMessage(targetCount: number): string {
  return targetCount > 1
    ? `Publicação enviada para ${targetCount} lojas`
    : "Publicação enviada para a fila";
}

/** The only store that can still take the product starts ticked; otherwise the reseller picks. */
function preselectedStores(stores: readonly ListingStore[]): string[] {
  const open = stores.filter((store) => !store.listed);
  return open.length === 1 ? open.map((store) => store.id) : [];
}

function useListingForm({ product, stores }: Pick<NewListingData, "product" | "stores">) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const schedule = useFeeSchedule();

  async function submit(value: ListingFormValues) {
    setSubmitError(null);
    const priceCents = parseBrlToCents(value.price);
    if (priceCents === null) {
      setSubmitError("Informe um preço válido");
      return;
    }
    // The server's own floor and words, said before the request.
    const floorProblem = priceFloorProblem(priceCents, { costCents: product.costCents }, schedule);
    if (floorProblem !== null) {
      setSubmitError(floorProblem);
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
      await queryClient.invalidateQueries({ queryKey: ["setup-progress"] });
      await navigate({ to: "/publicacoes" });
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  }

  const form = useForm({
    defaultValues: {
      title: product.title,
      description: product.description,
      price: formatCentsForInput(product.suggestedPriceCents),
      storeConnectionIds: preselectedStores(stores),
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
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Nova publicação</h1>
        <form.Subscribe selector={(state) => state.values.price}>
          {(price) => (
            <ProfitSentence priceCents={parseBrlToCents(price)} costCents={product.costCents} />
          )}
        </form.Subscribe>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ListingFieldsCard
          form={form}
          product={product}
          stores={stores}
          submitError={submitError}
        />
        <ListingSidebar form={form} product={product} />
      </div>
      <PublishBar form={form} stores={stores} />
    </form>
  );
}

function Strong({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("font-medium text-foreground", className)}>{children}</span>;
}

/** The dashboard's headline voice for one sale: "Você lucra R$ 45,83 por venda, com 38% de margem." */
function ProfitSentence({
  priceCents,
  costCents,
}: {
  priceCents: number | null;
  costCents: number;
}) {
  const estimate = estimateProfit(priceCents, costCents, useFeeSchedule());
  if (!estimate) {
    return (
      <p className="text-sm text-muted-foreground">Informe o preço de venda para ver o lucro.</p>
    );
  }
  if (estimate.profitCents < 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Com esse preço você tem{" "}
        <Strong className="text-destructive">
          prejuízo de {formatCents(-estimate.profitCents)}
        </Strong>{" "}
        por venda.
      </p>
    );
  }
  const tone = profitTone(estimate.profitCents, estimate.marginPercent);
  return (
    <p className="text-sm text-muted-foreground">
      Você lucra <Strong className={tone}>{formatCents(estimate.profitCents)}</Strong> por venda,
      com <Strong className={tone}>{wholeMarginPercent(estimate.marginPercent)}% de margem</Strong>.
    </p>
  );
}

function ListingFieldsCard({
  form,
  product,
  stores,
  submitError,
}: {
  readonly form: ListingFormApi;
  readonly product: ListingProduct;
  readonly stores: readonly ListingStore[];
  readonly submitError: string | null;
}) {
  return (
    <Card className="animate-in duration-500 ease-out fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
      <CardHeader>
        <CardTitle className="text-base">Anúncio</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
        <ListingTextFields form={form} product={product} />
        <form.Field name="price">
          {(field) => (
            <PriceField
              product={product}
              value={field.state.value}
              errors={field.state.meta.errors}
              onBlur={field.handleBlur}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
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

/** Small text action beside a field label, such as a character count or "Restaurar original". */
function FieldAside({ children }: { children: ReactNode }) {
  return (
    <span className="absolute top-0 right-0 flex h-5 items-center gap-3 text-xs text-muted-foreground tabular-nums">
      {children}
    </span>
  );
}

/** "42/60", turning red when a supplier's text already arrives over the limit. */
function CharacterCount({ value, max }: { value: string; max: number }) {
  const length = value.trim().length;
  return (
    <HintedText
      label={TERM_HINTS.characterLimit}
      className={cn(length > max && "font-medium text-destructive")}
    >
      {length.toLocaleString("pt-BR")}/{max.toLocaleString("pt-BR")}
    </HintedText>
  );
}

function ListingTextFields({
  form,
  product,
}: {
  readonly form: ListingFormApi;
  readonly product: ListingProduct;
}) {
  return (
    <>
      <form.Field name="title">
        {(field) => (
          <div className="relative">
            <TextField
              id="title"
              label="Título"
              maxLength={LISTING_TITLE_MAX_LENGTH}
              value={field.state.value}
              errors={field.state.meta.errors}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
            />
            <FieldAside>
              <CharacterCount value={field.state.value} max={LISTING_TITLE_MAX_LENGTH} />
            </FieldAside>
          </div>
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <div className="relative">
            <TextareaField
              id="description"
              label="Descrição"
              rows={4}
              maxLength={LISTING_DESCRIPTION_MAX_LENGTH}
              value={field.state.value}
              errors={field.state.meta.errors}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
            />
            <FieldAside>
              {field.state.value === product.description ? null : (
                <button
                  type="button"
                  onClick={() => field.handleChange(product.description)}
                  className="flex items-center gap-1 rounded-md transition-colors outline-none animate-in fade-in hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ArrowCounterClockwiseIcon className="size-3.5" aria-hidden="true" />
                  Restaurar original
                </button>
              )}
              <CharacterCount value={field.state.value} max={LISTING_DESCRIPTION_MAX_LENGTH} />
            </FieldAside>
          </div>
        )}
      </form.Field>
    </>
  );
}

interface PricePreset {
  key: string;
  label: string;
  priceCents: number;
}

/** The supplier's suggestion first, then the margin presets that land above the cost. */
/** A preset the server would refuse is left out: it would only lead to an error. */
function keepsFloor(product: ListingProduct, schedule: FeeSchedule) {
  return (preset: PricePreset) =>
    priceFloorProblem(preset.priceCents, { costCents: product.costCents }, schedule) === null;
}

function pricePresets(product: ListingProduct, schedule: FeeSchedule): PricePreset[] {
  const presets: PricePreset[] = [
    { key: "suggested", label: "Sugerido", priceCents: product.suggestedPriceCents },
  ];
  for (const margin of MARGIN_PRESETS) {
    const priceCents = priceForMargin(product.costCents, margin, schedule);
    if (priceCents !== null) {
      presets.push({ key: `margin-${margin}`, label: `Margem ${margin}%`, priceCents });
    }
  }
  return presets;
}

/** What a ready-made price means, in the reseller's words. */
function presetHint(preset: PricePreset): string {
  if (preset.key === "suggested") {
    return TERM_HINTS.suggestedPrice;
  }
  return `Preço para sobrar ${preset.label.replace("Margem ", "")} do valor da venda como lucro`;
}

/** Tint behind the margin badge, in step with `profitTone` for its text. */
function marginSurface(estimate: ProfitEstimate): string {
  if (estimate.profitCents < 0) {
    return "bg-destructive/10";
  }
  if (isThinMargin(estimate.marginPercent)) {
    return "bg-amber-500/10";
  }
  return "bg-brand/10";
}

function MarginBadge({ estimate }: { estimate: ProfitEstimate | null }) {
  if (!estimate) {
    return null;
  }
  const isLoss = estimate.profitCents < 0;
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap tabular-nums transition-colors duration-300",
        marginSurface(estimate),
        profitTone(estimate.profitCents, estimate.marginPercent),
      )}
    >
      {isLoss ? "Prejuízo" : `${wholeMarginPercent(estimate.marginPercent)}% de margem`}
    </span>
  );
}

function PricePresets({
  product,
  priceCents,
  onPick,
}: {
  readonly product: ListingProduct;
  readonly priceCents: number | null;
  readonly onPick: (value: string) => void;
}) {
  const schedule = useFeeSchedule();
  return (
    <fieldset className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <legend className="sr-only">Preços prontos</legend>
      {pricePresets(product, schedule)
        .filter(keepsFloor(product, schedule))
        .map((preset) => (
          <Hint key={preset.key} label={presetHint(preset)} openOnTap={false}>
            <button
              type="button"
              aria-pressed={priceCents === preset.priceCents}
              onClick={() => onPick(formatCentsForInput(preset.priceCents))}
              className="flex flex-col items-center justify-center rounded-2xl bg-muted px-3 py-1.5 text-xs whitespace-nowrap sm:h-8 sm:flex-row sm:gap-1.5 sm:rounded-full sm:py-0 font-medium text-muted-foreground transition-[background-color,color,box-shadow,transform] duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] aria-pressed:bg-brand/15 aria-pressed:text-brand-text aria-pressed:ring-1 aria-pressed:ring-brand/40 motion-reduce:active:scale-100"
            >
              {preset.label}
              <span className="font-normal tabular-nums opacity-80">
                {formatCents(preset.priceCents)}
              </span>
            </button>
          </Hint>
        ))}
    </fieldset>
  );
}

/**
 * The price is typed freely; the presets fill it in one tap and the badge inside the field
 * follows whatever is typed, so the margin is always the one of the price on screen.
 */
function PriceField({
  product,
  value,
  errors,
  onBlur,
  onChange,
}: {
  readonly product: ListingProduct;
  readonly value: string;
  readonly errors: readonly unknown[];
  readonly onBlur: () => void;
  readonly onChange: (value: string) => void;
}) {
  const priceCents = parseBrlToCents(value);
  const estimate = estimateProfit(priceCents, product.costCents, useFeeSchedule());
  const message = firstErrorMessage(errors);
  return (
    <div className="grid gap-2">
      <Label htmlFor="price">Preço de venda</Label>
      <div className="relative">
        <span
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted-foreground"
          aria-hidden="true"
        >
          R$
        </span>
        <input
          id="price"
          inputMode="decimal"
          autoComplete="off"
          // "1.000.000,00" plus room for a typo the field can still show and explain.
          maxLength={16}
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^\d.,]/g, ""))}
          onBlur={() => {
            const cents = parseBrlToCents(value);
            if (cents !== null && cents > 0) {
              onChange(formatCentsForInput(cents));
            }
            onBlur();
          }}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? "price-error" : "price-hint"}
          className="h-12 w-full rounded-full border border-field-border bg-field pr-36 pl-11 text-lg font-semibold tabular-nums transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
        />
        <MarginBadge estimate={estimate} />
      </div>
      <PricePresets product={product} priceCents={priceCents} onPick={onChange} />
      {message ? (
        <p id="price-error" className="text-sm text-destructive">
          {message}
        </p>
      ) : (
        <p id="price-hint" className="text-xs text-muted-foreground">
          Digite o preço que quiser ou use um dos prontos. Custo do fornecedor:{" "}
          {formatCents(product.costCents)}.
        </p>
      )}
    </div>
  );
}

function storeSubtitle(store: ListingStore): string | null {
  return displayStoreName(store.shopName) === store.shopName
    ? null
    : "Loja simulada · pedidos de teste";
}

/** Under the store name: that it already sells the product, or what kind of store it is. */
function StoreNote({ listed, subtitle }: { listed: boolean; subtitle: string | null }) {
  if (listed) {
    return <ToneStatus tone="success" label="Já publicado aqui" />;
  }
  if (subtitle === null) {
    return null;
  }
  return <span className="block text-xs text-muted-foreground">{subtitle}</span>;
}

function StoreOption({
  store,
  checked,
  onCheckedChange,
}: {
  readonly store: ListingStore;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  const subtitle = storeSubtitle(store);
  return (
    <Label
      htmlFor={`store-${store.id}`}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-field-border bg-field px-3 py-2.5 font-normal transition-[border-color,background-color] duration-200 has-data-checked:border-brand-strong has-data-checked:bg-brand/5 dark:has-data-checked:border-brand",
        // Only the name greys out: dimming the whole card too would fade the disabled box twice.
        store.listed ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <MarketplaceMark marketplace={store.marketplace} className="size-9 rounded-lg" />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-medium", store.listed && "text-muted-foreground")}>
          {displayStoreName(store.shopName)}
        </span>
        <StoreNote listed={store.listed} subtitle={subtitle} />
      </span>
      <Checkbox
        id={`store-${store.id}`}
        checked={checked}
        disabled={store.listed}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
    </Label>
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
  const open = stores.filter((store) => !store.listed);
  const allSelected = selectedIds.length === open.length;
  return (
    <fieldset>
      <legend className="float-left mb-3 text-sm font-medium">Publicar em</legend>
      {open.length > 1 ? (
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : open.map((store) => store.id))}
          className="float-right rounded-md text-xs font-medium text-brand-text transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {allSelected ? "Limpar seleção" : "Selecionar todas"}
        </button>
      ) : null}
      <div className="clear-both grid gap-2 sm:grid-cols-2">
        {stores.map((store) => (
          <StoreOption
            key={store.id}
            store={store}
            checked={selectedIds.includes(store.id)}
            onCheckedChange={(on) =>
              onChange(
                on ? [...selectedIds, store.id] : selectedIds.filter((id) => id !== store.id),
              )
            }
          />
        ))}
      </div>
      {open.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Este produto já está publicado em todas as suas lojas. Para mudar preço ou texto, edite o
          anúncio em Publicações.
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {message}
        </p>
      ) : null}
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
    <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <form.Subscribe
        selector={(state) => ({ title: state.values.title, price: state.values.price })}
      >
        {({ title, price }) => (
          <>
            <ListingPreview product={product} title={title} priceCents={parseBrlToCents(price)} />
            <ProfitCard priceCents={parseBrlToCents(price)} product={product} />
          </>
        )}
      </form.Subscribe>
    </div>
  );
}

function publishSummary(selected: readonly ListingStore[]): string {
  const [only] = selected;
  if (selected.length === 1 && only) {
    return `Vai para ${displayStoreName(only.shopName)}`;
  }
  if (selected.length === 0) {
    return "Escolha ao menos uma loja";
  }
  return `Vai para ${pluralize(selected.length, "loja", "lojas")}`;
}

/** Floating pill like the catalog's selection bar: where the ad goes and the one action. */
function PublishBar({
  form,
  stores,
}: {
  readonly form: ListingFormApi;
  readonly stores: readonly ListingStore[];
}) {
  return (
    <form.Subscribe
      selector={(state) => ({
        selectedIds: state.values.storeConnectionIds,
        isSubmitting: state.isSubmitting,
      })}
    >
      {({ selectedIds, isSubmitting }) => {
        const selected = stores.filter((store) => selectedIds.includes(store.id));
        return (
          <section
            aria-label="Publicar"
            className="sticky bottom-4 z-20 flex items-center gap-3 rounded-full bg-card p-1.5 pl-3 shadow-lg ring-1 shadow-black/20 ring-border animate-in duration-300 fade-in slide-in-from-bottom-3 motion-reduce:animate-none"
          >
            <span className="flex shrink-0" aria-hidden="true">
              {selected.slice(0, 3).map((store) => (
                <MarketplaceMark
                  key={store.id}
                  marketplace={store.marketplace}
                  className="-ml-2 size-7 rounded-lg ring-2 ring-card first:ml-0 animate-in zoom-in-75 fade-in duration-200"
                />
              ))}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" aria-live="polite">
              {publishSummary(selected)}
            </p>
            <Hint label={ACTION_ICONS.publish.hint} openOnTap={false}>
              <Button type="submit" size="lg" disabled={isSubmitting}>
                <PublishIcon aria-hidden="true" />
                {isSubmitting ? "Enviando…" : publishLabel(selected.length)}
              </Button>
            </Hint>
          </section>
        );
      }}
    </form.Subscribe>
  );
}

function publishLabel(count: number): string {
  return count === 0 ? "Publicar" : `Publicar em ${pluralize(count, "loja", "lojas")}`;
}
