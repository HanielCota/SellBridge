import type { BillingHolder } from "@sellbridge/database/repositories";
import { formatCnpj, formatPhone, phoneSchema } from "@sellbridge/shared/account-documents";
import { cpfSchema, formatCpf } from "@sellbridge/shared/cpf";
import { companySchema, fullNameSchema } from "@sellbridge/shared/schemas";
import { useForm, useStore } from "@tanstack/react-form";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { FloatingTextField } from "@/components/form/floating-field";
import { BillingNotice } from "@/components/region/billing-holder";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { saveOnboardingHolder } from "@/features/onboarding/onboarding.functions";
import { errorMessage } from "@/lib/errors";

const appRoute = getRouteApi("/_app");

interface HolderFormValues {
  fullName: string;
  cpf: string;
  phone: string;
  isCompany: boolean;
  cnpj: string;
  companyName: string;
}

function holderDefaults(holder: BillingHolder | null, accountName: string): HolderFormValues {
  return {
    fullName: holder?.fullName ?? accountName,
    cpf: holder === null ? "" : formatCpf(holder.cpf),
    phone: holder === null || holder.phone === null ? "" : formatPhone(holder.phone),
    isCompany: holder?.company !== null && holder !== null,
    cnpj: holder?.company ? formatCnpj(holder.company.cnpj) : "",
    companyName: holder?.company?.companyName ?? "",
  };
}

/** The form's fields as the server takes them: the company only when the box is ticked. */
function holderInput(value: HolderFormValues) {
  const company = value.isCompany ? { cnpj: value.cnpj, companyName: value.companyName } : null;
  return { fullName: value.fullName, cpf: value.cpf, phone: value.phone, company };
}

function useHolderForm(holder: BillingHolder | null, onSaved: (saved: BillingHolder) => void) {
  const { session } = appRoute.useRouteContext();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: holderDefaults(holder, session.user.name),
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        onSaved(await saveOnboardingHolder({ data: holderInput(value) }));
      } catch (error) {
        setSubmitError(errorMessage(error));
      }
    },
  });
  return { form, submitError };
}

type HolderFormApi = ReturnType<typeof useHolderForm>["form"];

/** Field errors wait for the first save attempt, so nothing is flagged while the user types. */
function visibleErrors(errors: readonly unknown[], hasSubmitted: boolean): readonly unknown[] {
  return hasSubmitted ? errors : [];
}

/**
 * On a first attempt, TanStack Form stops at the first field with an error; validating every
 * field first flags them all at once.
 */
async function submitHolder(form: HolderFormApi) {
  await form.validateAllFields("submit");
  await form.handleSubmit();
}

/** Who invoices go to and how to reach them (item 26.a, L2): name, CPF, phone and company. */
export function HolderForm({
  holder,
  submitLabel,
  onSaved,
}: {
  holder: BillingHolder | null;
  submitLabel: string;
  onSaved: (saved: BillingHolder) => void;
}) {
  const { form, submitError } = useHolderForm(holder, onSaved);
  const hasSubmitted = useStore(form.store, (state) => state.submissionAttempts > 0);
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
              onCheckedChange={(state) => field.handleChange(state === true)}
            />
            <label htmlFor="holder-is-company" className="text-sm">
              Vendo como empresa (CNPJ)
            </label>
          </div>
        )}
      </form.Field>
      {isCompany ? <CompanyInputs form={form} showErrors={showErrors} /> : null}
    </div>
  );
}

/**
 * Checks a company field only while "Vendo como empresa" is ticked: unticked, a half-typed CNPJ
 * must not block saving.
 */
function companyFieldError(
  key: keyof typeof companySchema.shape,
  value: string,
  isCompany: boolean,
): string | undefined {
  if (!isCompany) {
    return undefined;
  }
  const parsed = companySchema.shape[key].safeParse(value);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
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
    </div>
  );
}
