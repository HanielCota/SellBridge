import type { BillingHolder } from "@sellbridge/database/repositories";
import { formatCnpj, formatPhone, phoneSchema } from "@sellbridge/shared/account-documents";
import { cpfSchema, formatCpf } from "@sellbridge/shared/cpf";
import { TAX_REGIME_LABELS, TAX_REGIMES, type TaxRegime } from "@sellbridge/shared/product-fiscal";
import { companySchema, fullNameSchema } from "@sellbridge/shared/schemas";
import { useForm, useStore } from "@tanstack/react-form";
import { getRouteApi } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FloatingTextField } from "@/components/form/floating-field";
import { BillingNotice } from "@/components/region/billing-holder";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { saveOnboardingHolder } from "@/features/onboarding/onboarding.functions";
import { errorMessage } from "@/lib/errors";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { BillingAddressSection } from "@/components/onboarding/holder-address-fields";
import { MeiTip } from "@/components/onboarding/mei-tip";
import {
  holderDefaults,
  holderInput,
  STATE_REGISTRATION_EXEMPT,
  switchHolderType,
  visibleErrors,
} from "@/components/onboarding/holder-values";
import { cn } from "@/lib/utils";

const appRoute = getRouteApi("/_app");

function useHolderForm(
  holder: BillingHolder | null,
  onSaved: (saved: BillingHolder) => void | Promise<void>,
) {
  const { session } = appRoute.useRouteContext();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState(holder);
  const finalizingSave = useRef(false);
  const form = useForm({
    defaultValues: holderDefaults(holder, session.user.name),
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const saved = await saveOnboardingHolder({ data: holderInput(value) });
        finalizingSave.current = true;
        form.reset(holderDefaults(saved, session.user.name));
        setLastSaved(saved);
        await onSaved(saved);
      } catch (error) {
        setSubmitError(errorMessage(error));
      } finally {
        finalizingSave.current = false;
      }
    },
  });
  // The address fields remount after a save and may change form state while navigation settles.
  const hasUnsavedChanges = () => !finalizingSave.current && !form.state.isDefaultValue;
  return { form, submitError, lastSaved, hasUnsavedChanges };
}

/** A saved address whose city has no IBGE code: a company must pick it from the list again. */
function savedCityLacksCode(saved: BillingHolder | null): boolean {
  if (saved === null || saved.address === null) {
    return false;
  }
  return saved.address.ibgeCode === undefined;
}

export type HolderFormApi = ReturnType<typeof useHolderForm>["form"];

/**
 * On a first attempt, TanStack Form stops at the first field with an error; validating every
 * field first flags them all at once.
 */
async function submitHolder(form: HolderFormApi) {
  await form.validateAllFields("submit");
  await form.handleSubmit();
}

/**
 * Who invoices go to, how to reach them and where to bill them (item 26.a, L2): name, CPF,
 * phone, company and the billing address.
 */
export function HolderForm({
  holder,
  submitLabel,
  onSaved,
}: {
  holder: BillingHolder | null;
  submitLabel: string;
  onSaved: (saved: BillingHolder) => void | Promise<void>;
}) {
  const { form, submitError, lastSaved, hasUnsavedChanges } = useHolderForm(holder, onSaved);
  const hasSubmitted = useStore(form.store, (state) => state.submissionAttempts > 0);
  const isDirty = useStore(form.store, (state) => !state.isDefaultValue);
  const isCompany = useStore(form.store, (state) => state.values.isCompany);
  useUnsavedChanges(isDirty, hasUnsavedChanges);
  return (
    <form
      noValidate
      className="grid grid-cols-1 gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submitHolder(form);
      }}
    >
      <PersonFields form={form} showErrors={hasSubmitted} />
      <CompanyFields form={form} showErrors={hasSubmitted} />
      {/* Keyed by the saved address so a save folds the fields back behind the eye. */}
      <BillingAddressSection
        key={JSON.stringify(lastSaved?.address ?? null)}
        form={form}
        showErrors={hasSubmitted}
        savedAddress={lastSaved?.address ?? null}
        isMissing={lastSaved !== null && lastSaved.address === null}
        needsCityCode={isCompany && savedCityLacksCode(lastSaved)}
      />
      {submitError ? (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
      <BillingNotice />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full sm:w-fit">
            {isSubmitting ? "Salvando…" : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function PersonFields({ form, showErrors }: { form: HolderFormApi; showErrors: boolean }) {
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
      <form.Field name="phone" validators={{ onChange: phoneSchema }}>
        {(field) => (
          <FloatingTextField
            id="holder-phone"
            label="Telefone com DDD"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={field.state.value}
            errors={visibleErrors(field.state.meta.errors, showErrors)}
            onBlur={field.handleBlur}
            onValueChange={(next) => field.handleChange(formatPhone(next))}
          />
        )}
      </form.Field>
    </div>
  );
}

/** "Vendo como empresa": CNPJ and legal name, checked only while the box is ticked. */
function CompanyFields({ form, showErrors }: { form: HolderFormApi; showErrors: boolean }) {
  const isCompany = useStore(form.store, (state) => state.values.isCompany);
  return (
    <div className="grid gap-3">
      <form.Field name="isCompany">
        {(field) => (
          <div className="flex items-center gap-3">
            <Checkbox
              id="holder-is-company"
              checked={field.state.value}
              onCheckedChange={(state) => switchCompanyMode(form, state === true)}
            />
            <label htmlFor="holder-is-company" className="text-sm">
              Vendo como empresa (CNPJ)
            </label>
          </div>
        )}
      </form.Field>
      {isCompany ? <CompanyInputs form={form} showErrors={showErrors} /> : <MeiTip />}
    </div>
  );
}

/**
 * Ticking or unticking the box starts CNPJ and legal name clean, without the old errors, so the
 * seller types the company again on purpose (L2-2).
 */
function switchCompanyMode(form: HolderFormApi, isCompany: boolean) {
  const next = switchHolderType(form.state.values, isCompany);
  form.setFieldValue("isCompany", next.isCompany);
  form.setFieldValue("regime", next.regime);
  for (const name of ["cnpj", "companyName", "stateRegistration"] as const) {
    form.setFieldValue(name, next[name], { dontValidate: true });
    form.setFieldMeta(name, (meta) => ({ ...meta, errorMap: {}, isTouched: false }));
  }
}

/**
 * Checks a company field only while "Vendo como empresa" is ticked: unticked, a half-typed CNPJ
 * must not block saving.
 */
function companyFieldError(
  key: "cnpj" | "companyName" | "stateRegistration",
  value: string,
  isCompany: boolean,
): string | undefined {
  if (!isCompany) {
    return undefined;
  }
  const parsed = companySchema.shape[key].safeParse(value);
  if (parsed.success) {
    return undefined;
  }
  // The form offers a box for "ISENTO" instead of asking to type the word.
  return key === "stateRegistration" ? STATE_REGISTRATION_HINT : parsed.error.issues[0]?.message;
}

function CompanyInputs({ form, showErrors }: { form: HolderFormApi; showErrors: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <form.Field
        name="cnpj"
        validators={{
          onChange: ({ value, fieldApi }) =>
            companyFieldError("cnpj", value, fieldApi.form.getFieldValue("isCompany")),
        }}
      >
        {(field) => (
          <FloatingTextField
            id="holder-cnpj"
            label="CNPJ"
            autoCapitalize="characters"
            autoComplete="off"
            value={field.state.value}
            errors={visibleErrors(field.state.meta.errors, showErrors)}
            onBlur={field.handleBlur}
            onValueChange={(next) => field.handleChange(formatCnpj(next))}
          />
        )}
      </form.Field>
      <form.Field
        name="companyName"
        validators={{
          onChange: ({ value, fieldApi }) =>
            companyFieldError("companyName", value, fieldApi.form.getFieldValue("isCompany")),
        }}
      >
        {(field) => (
          <FloatingTextField
            id="holder-company-name"
            label="Razão social"
            autoComplete="organization"
            value={field.state.value}
            errors={visibleErrors(field.state.meta.errors, showErrors)}
            onBlur={field.handleBlur}
            onValueChange={field.handleChange}
          />
        )}
      </form.Field>
      <StateRegistrationInput form={form} showErrors={showErrors} />
      <RegimeChoice form={form} />
      <p className="text-footnote text-muted-foreground sm:col-span-2">
        A inscrição estadual e o regime saem nas notas fiscais das suas vendas. Na dúvida, confira
        com o seu contador.
      </p>
    </div>
  );
}

/**
 * The state registration, or "ISENTO" while the box is ticked: a company without one ticks it
 * instead of typing the word.
 */
function StateRegistrationInput({
  form,
  showErrors,
}: {
  form: HolderFormApi;
  showErrors: boolean;
}) {
  return (
    <form.Field
      name="stateRegistration"
      validators={{
        onChange: ({ value, fieldApi }) =>
          companyFieldError("stateRegistration", value, fieldApi.form.getFieldValue("isCompany")),
      }}
    >
      {(field) => {
        const isExempt = field.state.value === STATE_REGISTRATION_EXEMPT;
        return (
          <div className="grid gap-2 sm:col-span-2">
            {isExempt ? null : (
              <FloatingTextField
                id="holder-state-registration"
                label="Inscrição estadual"
                inputMode="numeric"
                autoComplete="off"
                value={field.state.value}
                errors={visibleErrors(field.state.meta.errors, showErrors)}
                onBlur={field.handleBlur}
                onValueChange={field.handleChange}
              />
            )}
            <div className="flex min-h-11 items-center gap-3">
              <Checkbox
                id="holder-state-registration-exempt"
                checked={isExempt}
                onCheckedChange={(state) =>
                  field.handleChange(state === true ? STATE_REGISTRATION_EXEMPT : "")
                }
              />
              <label htmlFor="holder-state-registration-exempt" className="text-sm">
                Minha empresa não tem inscrição estadual (isenta)
              </label>
            </div>
          </div>
        );
      }}
    </form.Field>
  );
}

const STATE_REGISTRATION_HINT =
  "Informe a inscrição estadual só com números. Se a empresa não tem, marque a opção abaixo.";

const REGIME_HINTS: Readonly<Record<TaxRegime, string | null>> = {
  simples: "Inclui MEI",
  presumido: null,
  real: null,
};

/** Three choices in sight, the most likely one already picked (L2, NF-e data). */
function RegimeChoice({ form }: { form: HolderFormApi }) {
  return (
    <form.Field name="regime">
      {(field) => (
        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">Regime tributário</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TAX_REGIMES.map((regime) => (
              <label
                key={regime}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-field-border bg-field px-4 py-2 text-sm transition-[border-color,box-shadow] duration-150",
                  "has-checked:border-foreground/70 has-checked:bg-muted/60",
                  "has-focus-visible:ring-4 has-focus-visible:ring-brand/20",
                )}
              >
                <input
                  type="radio"
                  name="holder-regime"
                  value={regime}
                  checked={field.state.value === regime}
                  onChange={() => field.handleChange(regime)}
                  className="size-4 accent-brand-strong"
                />
                <span className="grid">
                  <span className="font-medium">{TAX_REGIME_LABELS[regime]}</span>
                  {REGIME_HINTS[regime] === null ? null : (
                    <span className="text-footnote text-muted-foreground">
                      {REGIME_HINTS[regime]}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </form.Field>
  );
}
