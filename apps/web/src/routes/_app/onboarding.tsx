import { formatCep, normalizeCep, type ResolvedAddress } from "@sellbridge/shared/cep";
import { cpfSchema, formatCpf } from "@sellbridge/shared/cpf";
import {
  NO_HOUSE_NUMBER,
  fullNameSchema,
  optionalParameter,
  freeText,
} from "@sellbridge/shared/schemas";
import { ArrowLeftIcon, ArrowSquareOutIcon, CheckIcon } from "@phosphor-icons/react";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";
import { z } from "zod";
import { FloatingTextField } from "@/components/form/floating-field";
import { BillingNotice, StepProgress } from "@/components/region/billing-holder";
import { CepField, type CepLookupStatus } from "@/components/region/cep-field";
import { CurrentRegionCard } from "@/components/region/current-region-card";
import { RegionMapMark } from "@/components/region/region-map-mark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getTenantRegion, updateTenantRegion } from "@/features/region/region.functions";
import { addressLookupQueryOptions } from "@/features/region/region.queries";
import { setupProgressQueryOptions } from "@/features/reports/reports.queries";
import { errorMessage } from "@/lib/errors";
import { revealAutofill, shakeField } from "@/lib/field-motion";
import { cepSearchParameter } from "@/lib/cep-search-parameter";
import { cn } from "@/lib/utils";

const onboardingSearchSchema = z.object({
  redirect: optionalParameter(z.string().startsWith("/")),
  /** CEP digitado na landing page; só preenche o campo enquanto não há região salva. */
  cep: cepSearchParameter,
});

/*
 * Each field validates on change, and a submit runs those same validators. So an error shows up
 * when the user tries to save and goes away the moment the field is fixed, never on blur: a
 * message appearing on blur would shift the form under a click that is already on its way.
 */
const cepFieldSchema = z
  .string()
  .refine((value) => normalizeCep(value) !== null, "Informe um CEP com 8 dígitos");
const streetFieldSchema = freeText().trim().min(1, "Informe a rua");
const neighborhoodFieldSchema = freeText().trim().min(1, "Informe o bairro");
const optionalFieldSchema = z.string();

interface AddressValues {
  fullName: string;
  cpf: string;
  cep: string;
  street: string;
  number: string;
  noNumber: boolean;
  complement: string;
  neighborhood: string;
}

/** The Correios lookup by address, for whoever does not know their CEP. */
const CORREIOS_CEP_SEARCH_URL = "https://buscacepinter.correios.com.br/app/endereco/index.php";

export const Route = createFileRoute("/_app/onboarding")({
  validateSearch: onboardingSearchSchema,
  head: () => ({ meta: [{ title: "Seus dados | SellBridge" }] }),
  loader: () => getTenantRegion(),
  component: OnboardingPage,
});

type TenantRegion = Awaited<ReturnType<typeof getTenantRegion>>;

function OnboardingPage() {
  const region = Route.useLoaderData();
  if (region) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <PageTitle title="Alterar seus dados" />
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <CurrentRegionCard region={region} />
          {/* Sticky so the form stays beside the address card while scrolling. */}
          <section
            aria-labelledby="change-region"
            className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-6 lg:sticky lg:top-24"
          >
            <div className="space-y-1">
              <h2 id="change-region" className="text-subhead font-semibold">
                Seus dados e endereço
              </h2>
              <p className="text-sm text-muted-foreground">
                Usados nas notas fiscais e cobranças. Confira antes de salvar.
              </p>
            </div>
            <AddressForm region={region} />
          </section>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <RegionMapMark className="size-12 shrink-0" />
        <PageTitle title="Seu cadastro" />
      </div>
      <section aria-label="Cadastro" className="surface-card rounded-3xl bg-card p-5 sm:p-8">
        <AddressForm region={null} />
      </section>
    </div>
  );
}

function PageTitle({ title }: { title: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Seu nome, CPF e endereço, usados nas notas fiscais e cobranças.
      </p>
    </div>
  );
}

/** The saved region wins; before there is one, a CEP typed on the landing page fills the field. */
function initialCep(region: TenantRegion, fromLanding: string | undefined): string {
  if (region) {
    return formatCep(region.cep);
  }
  return fromLanding ? formatCep(fromLanding) : "";
}

function defaultValues(
  region: TenantRegion,
  fromLanding: string | undefined,
  accountName: string,
): AddressValues {
  return {
    fullName: region?.fullName ?? accountName,
    cpf: region?.cpf ? formatCpf(region.cpf) : "",
    cep: initialCep(region, fromLanding),
    street: region?.street ?? "",
    number: region?.number && region.number !== NO_HOUSE_NUMBER ? region.number : "",
    noNumber: region?.number === NO_HOUSE_NUMBER,
    complement: region?.complement ?? "",
    neighborhood: region?.neighborhood ?? "",
  };
}

function useAddressForm(region: TenantRegion) {
  const search = Route.useSearch();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set once the address is stored, so the button confirms it while the next page loads.
  const [isSaved, setIsSaved] = useState(false);

  const form = useForm({
    defaultValues: defaultValues(region, search.cep, session.user.name),
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await updateTenantRegion({
          data: {
            fullName: value.fullName,
            cpf: value.cpf,
            cep: value.cep,
            street: value.street,
            number: value.noNumber ? NO_HOUSE_NUMBER : value.number,
            complement: value.complement,
            neighborhood: value.neighborhood,
          },
        });
      } catch (error) {
        setSubmitError(errorMessage(error));
        return;
      }
      setIsSaved(true);
      await router.invalidate();
      const progress = await queryClient.fetchQuery({
        ...setupProgressQueryOptions(),
        staleTime: 0,
      });
      await navigate({ to: search.redirect ?? (progress.hasStore ? "/catalogo" : "/lojas") });
    },
  });
  return { form, submitError, isSaved };
}

type AddressFormApi = ReturnType<typeof useAddressForm>["form"];

function lookupStatus(
  cep: string | null,
  query: { isPending: boolean; isError: boolean },
): CepLookupStatus {
  if (cep === null) {
    return "idle";
  }
  if (query.isError) {
    return "missing";
  }
  return query.isPending ? "searching" : "found";
}

/**
 * The lookup of the typed CEP, shared with the autofill through the query cache. The saved CEP
 * needs none: its city and state are already known.
 */
function useCepLookup(form: AddressFormApi, region: TenantRegion) {
  const typed = useStore(form.store, (state) => normalizeCep(state.values.cep));
  const cep = typed !== null && typed !== region?.cep ? typed : null;
  const query = useQuery({ ...addressLookupQueryOptions(cep ?? ""), enabled: cep !== null });
  const status = lookupStatus(cep, query);
  const address = status === "found" ? query.data : undefined;
  const savedPlace = typed !== null && typed === region?.cep ? region : null;
  const place = address ?? savedPlace;
  return {
    cep,
    status,
    city: place?.city ?? "",
    state: place?.state ?? "",
    error: status === "missing" ? errorMessage(query.error) : null,
  };
}

type CepLookup = ReturnType<typeof useCepLookup>;

/**
 * Fills street and neighborhood as soon as a typed CEP resolves, plays the autofill cascade over
 * what it filled and moves the cursor to the first field still to fill. A value the user typed by
 * hand is only replaced by a real one from the CEP; an autofilled value the new CEP does not have
 * is cleared. A CEP that does not exist shakes the field.
 */
function useCepAutofill(form: AddressFormApi, region: TenantRegion) {
  const queryClient = useQueryClient();
  const autofilled = useRef({ street: "", neighborhood: "" });

  function fill(name: "street" | "neighborhood", value: string | null) {
    if (value) {
      form.setFieldValue(name, value);
      autofilled.current[name] = value;
      return;
    }
    if (form.getFieldValue(name) === autofilled.current[name]) {
      form.setFieldValue(name, "");
    }
  }

  return async function handleCepChange(masked: string) {
    const cep = normalizeCep(masked);
    if (cep === null || cep === region?.cep) {
      return;
    }
    const address: ResolvedAddress | null = await queryClient
      .fetchQuery(addressLookupQueryOptions(cep))
      .catch(() => null);
    // The user may have kept typing while the lookup ran.
    if (normalizeCep(form.getFieldValue("cep")) !== cep) {
      return;
    }
    if (address === null) {
      shakeField(document.getElementById("cep")?.parentElement ?? null);
      return;
    }
    fill("street", address.street);
    fill("neighborhood", address.neighborhood);
    const filled = [
      address.street ? "address-street" : null,
      address.neighborhood ? "address-neighborhood" : null,
      "address-city",
      "address-state",
    ].filter((id) => id !== null);
    // After React has painted the new values, city and state included.
    requestAnimationFrame(() => requestAnimationFrame(() => revealAutofill(filled)));
    if (document.activeElement?.id === "cep") {
      const next = address.street ? "address-number" : "address-street";
      document.getElementById(next)?.focus();
    }
  };
}

/**
 * On a first attempt, TanStack Form gives up as soon as one field already has an error (a
 * half-typed CEP) and never checks the others. Validating every field first flags them all at once.
 */
async function submitAddress(form: AddressFormApi) {
  await form.validateAllFields("submit");
  await form.handleSubmit();
}

const SIGNUP_STEPS = [{ title: "Seus dados" }, { title: "Endereço" }] as const;

/**
 * A first visit fills the form in two steps, holder then address; changing the data later shows
 * everything at once. Both steps share one form, so going back keeps what was typed.
 */
function AddressForm({ region }: { region: TenantRegion }) {
  const controller = useAddressForm(region);
  const [step, setStep] = useState(0);
  if (region === null && step === 0) {
    return (
      <HolderStep
        form={controller.form}
        onContinue={() => {
          setStep(1);
          requestAnimationFrame(() => document.getElementById("cep")?.focus());
        }}
      />
    );
  }
  return (
    <AddressStep
      controller={controller}
      region={region}
      onBack={region === null ? () => setStep(0) : undefined}
    />
  );
}

/** Checks name and CPF before the address step, flagging both at once. */
async function holderIsValid(form: AddressFormApi): Promise<boolean> {
  const results = await Promise.all([
    form.validateField("fullName", "submit"),
    form.validateField("cpf", "submit"),
  ]);
  return results.every((errors) => errors.length === 0);
}

async function continueIfValid(form: AddressFormApi, onContinue: () => void) {
  if (await holderIsValid(form)) {
    onContinue();
  }
}

function HolderStep({ form, onContinue }: { form: AddressFormApi; onContinue: () => void }) {
  const [showErrors, setShowErrors] = useState(false);
  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setShowErrors(true);
        void continueIfValid(form, onContinue);
      }}
    >
      <StepProgress steps={SIGNUP_STEPS} current={0} />
      <HolderFields form={form} showErrors={showErrors} />
      <BillingNotice />
      <Button type="submit" size="lg" className="w-full sm:w-fit">
        Continuar
      </Button>
    </form>
  );
}

function AddressStep({
  controller,
  region,
  onBack,
}: {
  controller: ReturnType<typeof useAddressForm>;
  region: TenantRegion;
  onBack: (() => void) | undefined;
}) {
  const { form, submitError, isSaved } = controller;
  const lookup = useCepLookup(form, region);
  const handleCepChange = useCepAutofill(form, region);
  const hasSubmitted = useStore(form.store, (state) => state.submissionAttempts > 0);
  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submitAddress(form);
      }}
    >
      {region ? (
        <div className="grid gap-3">
          <HolderFields form={form} showErrors={hasSubmitted} />
          <BillingNotice />
        </div>
      ) : (
        <StepProgress steps={SIGNUP_STEPS} current={1} />
      )}
      {submitError ? (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <CepRow
          form={form}
          lookup={lookup}
          hasSubmitted={hasSubmitted}
          onCepChange={handleCepChange}
        />
      </div>
      <AddressFields
        form={form}
        hasSubmitted={hasSubmitted}
        city={lookup.city}
        state={lookup.state}
      />
      <AddressActions form={form} isSaved={isSaved} onBack={onBack} />
    </form>
  );
}

function AddressActions({
  form,
  isSaved,
  onBack,
}: {
  form: AddressFormApi;
  isSaved: boolean;
  onBack: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row">
      {onBack ? (
        <Button type="button" variant="ghost" size="lg" onClick={onBack}>
          <ArrowLeftIcon aria-hidden="true" />
          Voltar
        </Button>
      ) : null}
      <SubmitButton form={form} isSaved={isSaved} />
    </div>
  );
}

function HolderFields({ form, showErrors }: { form: AddressFormApi; showErrors: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <form.Field name="fullName" validators={{ onChange: fullNameSchema }}>
        {(field) => (
          <div className="sm:col-span-2">
            <FloatingTextField
              id="holder-full-name"
              label="Nome completo"
              autoComplete="name"
              value={field.state.value}
              errors={visibleErrors(field.state.meta.errors, showErrors)}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="cpf" validators={{ onChange: cpfSchema }}>
        {(field) => (
          <FloatingTextField
            id="holder-cpf"
            label="CPF"
            inputMode="numeric"
            autoComplete="off"
            value={field.state.value}
            errors={visibleErrors(field.state.meta.errors, showErrors)}
            onBlur={field.handleBlur}
            onValueChange={(next) => field.handleChange(formatCpf(next))}
          />
        )}
      </form.Field>
    </div>
  );
}

function SubmitButton({ form, isSaved }: { form: AddressFormApi; isSaved: boolean }) {
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || isSaved}
          className="w-full sm:w-fit"
        >
          {isSaved ? (
            <>
              <CheckIcon
                weight="bold"
                className="animate-in duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] zoom-in-50 motion-reduce:zoom-in-100"
                aria-hidden="true"
              />
              Dados salvos
            </>
          ) : null}
          {!isSaved && isSubmitting ? "Salvando…" : null}
          {!isSaved && !isSubmitting ? "Salvar dados" : null}
        </Button>
      )}
    </form.Subscribe>
  );
}

/** Field errors wait for the first save attempt, so nothing is flagged while the user types. */
function visibleErrors(errors: readonly unknown[], hasSubmitted: boolean): readonly unknown[] {
  return hasSubmitted ? errors : [];
}

function CepRow({
  form,
  lookup,
  hasSubmitted,
  onCepChange,
}: {
  form: AddressFormApi;
  lookup: CepLookup;
  hasSubmitted: boolean;
  onCepChange: (masked: string) => Promise<void>;
}) {
  return (
    <div className="grid items-start gap-2 sm:grid-cols-2 sm:gap-4">
      <form.Field name="cep" validators={{ onChange: cepFieldSchema }}>
        {(field) => (
          <CepField
            value={field.state.value}
            errors={[
              ...visibleErrors(field.state.meta.errors, hasSubmitted),
              ...(lookup.error ? [lookup.error] : []),
            ]}
            status={lookup.status}
            onBlur={field.handleBlur}
            onValueChange={(masked) => {
              field.handleChange(masked);
              void onCepChange(masked);
            }}
          />
        )}
      </form.Field>
      <a
        href={CORREIOS_CEP_SEARCH_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-fit items-center gap-1 rounded-md px-1 text-footnote text-brand-text underline-offset-4 hover:underline focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none sm:h-14"
      >
        Não sei meu CEP
        <ArrowSquareOutIcon className="size-3.5" aria-hidden="true" />
        <span className="sr-only">(abre a busca dos Correios em nova aba)</span>
      </a>
    </div>
  );
}

function TextInput({
  form,
  name,
  id,
  label,
  autoComplete,
  schema = optionalFieldSchema,
  hasSubmitted,
  className,
}: {
  form: AddressFormApi;
  name: "street" | "complement" | "neighborhood";
  id: string;
  label: string;
  autoComplete: string;
  schema?: z.ZodType<string, string>;
  hasSubmitted: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <form.Field name={name} validators={{ onChange: schema }}>
        {(field) => (
          <FloatingTextField
            id={id}
            label={label}
            autoComplete={autoComplete}
            value={field.state.value}
            errors={visibleErrors(field.state.meta.errors, hasSubmitted)}
            onBlur={field.handleBlur}
            onValueChange={field.handleChange}
          />
        )}
      </form.Field>
    </div>
  );
}

function NumberInput({ form, hasSubmitted }: { form: AddressFormApi; hasSubmitted: boolean }) {
  return (
    <form.Subscribe selector={(state) => state.values.noNumber}>
      {(noNumber) => (
        <div className="grid gap-2 sm:col-span-2">
          <form.Field
            name="number"
            validators={{
              // Re-checked when "Sem número" is ticked, which answers the question too.
              onChangeListenTo: ["noNumber"],
              onChange: ({ value, fieldApi }) =>
                fieldApi.form.getFieldValue("noNumber") || value.trim().length > 0
                  ? undefined
                  : "Informe o número",
            }}
          >
            {(field) => (
              <FloatingTextField
                id="address-number"
                label="Número"
                autoComplete="address-line2"
                disabled={noNumber}
                value={noNumber ? "" : field.state.value}
                errors={visibleErrors(field.state.meta.errors, hasSubmitted)}
                onBlur={field.handleBlur}
                onValueChange={field.handleChange}
                className="disabled:cursor-not-allowed disabled:opacity-60"
              />
            )}
          </form.Field>
          <form.Field name="noNumber">
            {(field) => (
              <div className="flex w-fit items-center gap-2 px-1">
                <Checkbox
                  id="address-no-number"
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                />
                <label htmlFor="address-no-number" className="text-footnote text-muted-foreground">
                  Sem número
                </label>
              </div>
            )}
          </form.Field>
        </div>
      )}
    </form.Subscribe>
  );
}

/** Filled from the CEP and read-only: city and state decide which suppliers deliver. */
function LockedField({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <FloatingTextField
      id={id}
      label={label}
      value={value}
      errors={[]}
      readOnly
      tabIndex={-1}
      onValueChange={() => undefined}
      className="cursor-default bg-muted/60 focus:border-field-border focus:ring-0"
    />
  );
}

interface AddressFieldsProps {
  form: AddressFormApi;
  hasSubmitted: boolean;
  city: string;
  state: string;
}

function AddressFields({ form, hasSubmitted, city, state }: AddressFieldsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <TextInput
        form={form}
        name="street"
        id="address-street"
        label="Rua ou avenida"
        autoComplete="address-line1"
        schema={streetFieldSchema}
        hasSubmitted={hasSubmitted}
        className="sm:col-span-6"
      />
      <NumberInput form={form} hasSubmitted={hasSubmitted} />
      <TextInput
        form={form}
        name="complement"
        id="address-complement"
        label="Complemento (opcional)"
        autoComplete="address-line3"
        hasSubmitted={hasSubmitted}
        className="sm:col-span-4"
      />
      <PlaceFields form={form} hasSubmitted={hasSubmitted} city={city} state={state} />
    </div>
  );
}

function PlaceFields({ form, hasSubmitted, city, state }: AddressFieldsProps) {
  return (
    <>
      <TextInput
        form={form}
        name="neighborhood"
        id="address-neighborhood"
        label="Bairro"
        autoComplete="address-level3"
        schema={neighborhoodFieldSchema}
        hasSubmitted={hasSubmitted}
        className="sm:col-span-3"
      />
      <div className="sm:col-span-2">
        <LockedField id="address-city" label="Cidade" value={city} />
      </div>
      <div className="sm:col-span-1">
        <LockedField id="address-state" label="UF" value={state} />
      </div>
      <FieldNote className="sm:col-span-6">Cidade e UF vêm do CEP.</FieldNote>
    </>
  );
}

function FieldNote({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("px-1 text-footnote text-muted-foreground", className)}>{children}</p>;
}
