import { billingAddressSchema, formatCep } from "@sellbridge/shared/billing-address";
import type { BillingAddress } from "@sellbridge/shared/billing-address";
import { BRAZILIAN_STATES } from "@sellbridge/shared/brazilian-states";
import { useEffect, useState } from "react";
import { FloatingSelectField, FloatingTextField } from "@/components/form/floating-field";
import type { HolderFormApi } from "@/components/onboarding/holder-form";
import { visibleErrors } from "@/components/onboarding/holder-values";
import { RevealableAddress } from "@/components/region/revealable-address";
import { Button } from "@/components/ui/button";

const fields = billingAddressSchema.shape;
const CEP_FIELD_ID = "holder-cep";

interface AddressSectionProps {
  form: HolderFormApi;
  showErrors: boolean;
  /** What the server holds; null for a new account or one saved before the address was asked. */
  savedAddress: BillingAddress | null;
  /** True when the rest of the holder is saved but the address is missing. */
  isMissing: boolean;
}

/**
 * The billing address: a saved one stays hidden behind the eye until the seller chooses to
 * change it, so the form does not show it to whoever is looking at the screen.
 */
export function BillingAddressSection({
  form,
  showErrors,
  savedAddress,
  isMissing,
}: AddressSectionProps) {
  const [isEditing, setIsEditing] = useState(savedAddress === null);
  const [wasOpenedByUser, setWasOpenedByUser] = useState(false);
  useEffect(() => {
    // "Alterar endereço" unmounts itself: hand focus to the first field instead of the page body.
    if (!wasOpenedByUser) {
      return;
    }
    document.getElementById(CEP_FIELD_ID)?.focus();
  }, [wasOpenedByUser]);
  function openAddressInputs() {
    setIsEditing(true);
    setWasOpenedByUser(true);
  }
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3 space-y-0.5">
        <span className="block text-sm font-medium">Endereço de cobrança</span>
        {isMissing ? (
          <span className="block text-footnote text-amber-700 dark:text-amber-400">
            Falta o endereço. Preencha para manter seu cadastro em dia.
          </span>
        ) : null}
      </legend>
      {isEditing || savedAddress === null ? (
        <AddressInputs form={form} showErrors={showErrors} />
      ) : (
        <SavedAddress address={savedAddress} onChange={openAddressInputs} />
      )}
    </fieldset>
  );
}

function SavedAddress({ address, onChange }: { address: BillingAddress; onChange: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <RevealableAddress address={address} className="min-w-0 flex-1" />
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onChange}>
        Alterar endereço
      </Button>
    </div>
  );
}

function AddressInputs({ form, showErrors }: { form: HolderFormApi; showErrors: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
      <StreetInputs form={form} showErrors={showErrors} />
      <NumberInputs form={form} showErrors={showErrors} />
      <PlaceInputs form={form} showErrors={showErrors} />
    </div>
  );
}

function StreetInputs({ form, showErrors }: { form: HolderFormApi; showErrors: boolean }) {
  return (
    <>
      <form.Field name="address.cep" validators={{ onChange: fields.cep }}>
        {(field) => (
          <div className="col-span-2">
            {/* Typed by hand for now; a CEP lookup (ViaCEP) will fill street to state later. */}
            <FloatingTextField
              id={CEP_FIELD_ID}
              label="CEP"
              inputMode="numeric"
              autoComplete="postal-code"
              value={field.state.value}
              errors={visibleErrors(field.state.meta.errors, showErrors)}
              onBlur={field.handleBlur}
              onValueChange={(next) => field.handleChange(formatCep(next))}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="address.street" validators={{ onChange: fields.street }}>
        {(field) => (
          <div className="col-span-2 sm:col-span-4">
            <FloatingTextField
              id="holder-street"
              label="Rua"
              autoComplete="address-line1"
              value={field.state.value}
              errors={visibleErrors(field.state.meta.errors, showErrors)}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
            />
          </div>
        )}
      </form.Field>
    </>
  );
}

function NumberInputs({ form, showErrors }: { form: HolderFormApi; showErrors: boolean }) {
  return (
    <>
      <form.Field name="address.number" validators={{ onChange: fields.number }}>
        {(field) => (
          <div className="col-span-1 sm:col-span-2">
            <FloatingTextField
              id="holder-number"
              label="Número"
              autoComplete="off"
              hint="Sem número? s/n"
              value={field.state.value}
              errors={visibleErrors(field.state.meta.errors, showErrors)}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="address.complement" validators={{ onChange: fields.complement }}>
        {(field) => (
          <div className="col-span-1 sm:col-span-4">
            <FloatingTextField
              id="holder-complement"
              label="Complemento"
              hint="Opcional"
              autoComplete="address-line2"
              value={field.state.value}
              errors={visibleErrors(field.state.meta.errors, showErrors)}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
            />
          </div>
        )}
      </form.Field>
    </>
  );
}

function PlaceInputs({ form, showErrors }: { form: HolderFormApi; showErrors: boolean }) {
  return (
    <>
      <form.Field name="address.neighborhood" validators={{ onChange: fields.neighborhood }}>
        {(field) => (
          <div className="col-span-2">
            <FloatingTextField
              id="holder-neighborhood"
              label="Bairro"
              autoComplete="address-level3"
              value={field.state.value}
              errors={visibleErrors(field.state.meta.errors, showErrors)}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="address.city" validators={{ onChange: fields.city }}>
        {(field) => (
          <div className="col-span-1 sm:col-span-2">
            <FloatingTextField
              id="holder-city"
              label="Cidade"
              autoComplete="address-level2"
              value={field.state.value}
              errors={visibleErrors(field.state.meta.errors, showErrors)}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="address.state" validators={{ onChange: fields.state }}>
        {(field) => (
          <div className="col-span-1 sm:col-span-2">
            <FloatingSelectField
              id="holder-state"
              label="Estado"
              autoComplete="address-level1"
              options={BRAZILIAN_STATES}
              value={field.state.value}
              errors={visibleErrors(field.state.meta.errors, showErrors)}
              onBlur={field.handleBlur}
              onValueChange={field.handleChange}
            />
          </div>
        )}
      </form.Field>
    </>
  );
}
