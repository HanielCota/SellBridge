import { formatCnpj, formatPhone } from "@sellbridge/shared/account-documents";
import { formatCpf } from "@sellbridge/shared/cpf";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { FloatingTextField } from "@/components/form/floating-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ASAAS_COMPANY_TYPE_LABELS,
  ASAAS_COMPANY_TYPES,
} from "@/features/supplier-payments/asaas-account-form";
import { openAsaasAccountFn } from "@/features/supplier-payments/asaas.functions";
import { asaasReceivingQueryOptions } from "@/features/supplier-payments/asaas.queries";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  ASAAS_ACCOUNT_STEPS,
  asaasAccountPayload,
  EMPTY_ASAAS_ACCOUNT,
  formatBrazilianDate,
  formatPostalCode,
  stepErrors,
  type AsaasAccountField,
  type AsaasAccountValues,
} from "./asaas-account-fields";

type Errors = Partial<Record<AsaasAccountField, string>>;

interface StepProps {
  values: AsaasAccountValues;
  errors: Errors;
  change: (field: AsaasAccountField, value: string) => void;
  /** Shows the field's warning as soon as the supplier leaves it, not only on Continuar. */
  check: (field: AsaasAccountField) => void;
  /** The contract sign-up rules are on: only a company account, and never an MEI. */
  companyOnly: boolean;
}

function Field(
  props: StepProps & {
    field: AsaasAccountField;
    label: string;
    hint?: string;
    format?: (typed: string) => string;
    inputMode?: "numeric" | "tel" | "email" | "decimal" | "text";
    autoComplete?: string;
  },
) {
  const { field, format } = props;
  return (
    <FloatingTextField
      id={`asaas-${field}`}
      label={props.label}
      hint={props.hint}
      inputMode={props.inputMode}
      autoComplete={props.autoComplete ?? "off"}
      value={props.values[field]}
      errors={props.errors[field] === undefined ? [] : [props.errors[field]]}
      onValueChange={(typed) => props.change(field, format === undefined ? typed : format(typed))}
      onBlur={() => props.check(field)}
    />
  );
}

function ChoiceButton(props: {
  name: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center rounded-xl border px-3 py-2 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        props.selected ? "border-foreground bg-muted" : "border-border text-muted-foreground",
      )}
    >
      <input
        type="radio"
        name={props.name}
        className="sr-only"
        checked={props.selected}
        onChange={props.onSelect}
      />
      {props.children}
    </label>
  );
}

const COMPANY_TYPE_ERROR_ID = "asaas-company-type-error";

function companyTypesFor(companyOnly: boolean) {
  return companyOnly ? ASAAS_COMPANY_TYPES.filter((type) => type !== "MEI") : ASAAS_COMPANY_TYPES;
}

function PersonTypeChoice(props: StepProps) {
  const isPerson = props.values.personType === "person";
  if (props.companyOnly) {
    return (
      <p className="text-sm text-muted-foreground">
        A conta de recebimento é da empresa: use o CNPJ de uma empresa ME, EPP ou maior. MEI e CPF
        não entram como fornecedor.
      </p>
    );
  }
  return (
    <fieldset className="grid grid-cols-2 gap-2">
      <legend className="mb-1 text-sm font-medium">Você recebe como</legend>
      <ChoiceButton
        name="asaas-person-type"
        selected={!isPerson}
        onSelect={() => props.change("personType", "company")}
      >
        Empresa (CNPJ)
      </ChoiceButton>
      <ChoiceButton
        name="asaas-person-type"
        selected={isPerson}
        onSelect={() => props.change("personType", "person")}
      >
        Pessoa (CPF)
      </ChoiceButton>
    </fieldset>
  );
}

function CompanyTypeField(props: StepProps) {
  return (
    <fieldset
      className="grid gap-2"
      aria-describedby={props.errors.companyType === undefined ? undefined : COMPANY_TYPE_ERROR_ID}
    >
      <legend className="mb-1 text-sm font-medium">Tipo de empresa</legend>
      <div className="grid grid-cols-2 gap-2">
        {companyTypesFor(props.companyOnly).map((type) => (
          <ChoiceButton
            key={type}
            name="asaas-company-type"
            selected={props.values.companyType === type}
            onSelect={() => props.change("companyType", type)}
          >
            {ASAAS_COMPANY_TYPE_LABELS[type]}
          </ChoiceButton>
        ))}
      </div>
      {props.errors.companyType === undefined ? null : (
        <p id={COMPANY_TYPE_ERROR_ID} role="alert" className="text-footnote text-destructive">
          {props.errors.companyType}
        </p>
      )}
    </fieldset>
  );
}

function WhoStep(props: StepProps) {
  const isPerson = props.values.personType === "person";
  return (
    <div className="grid gap-3">
      <PersonTypeChoice {...props} />
      <Field {...props} field="name" label={isPerson ? "Nome completo" : "Razão social"} />
      {isPerson ? (
        <>
          <Field {...props} field="document" label="CPF" inputMode="numeric" format={formatCpf} />
          <Field
            {...props}
            field="birthDate"
            label="Data de nascimento"
            hint="Exemplo: 31/12/1990"
            inputMode="numeric"
            format={formatBrazilianDate}
          />
        </>
      ) : (
        <>
          <Field {...props} field="document" label="CNPJ" format={formatCnpj} />
          <CompanyTypeField {...props} />
        </>
      )}
    </div>
  );
}

function ContactStep(props: StepProps) {
  return (
    <div className="grid gap-3">
      <Field {...props} field="email" label="E-mail" inputMode="email" autoComplete="email" />
      <Field
        {...props}
        field="mobilePhone"
        label="Celular com DDD"
        inputMode="tel"
        autoComplete="tel-national"
        format={formatPhone}
      />
      <Field
        {...props}
        field="postalCode"
        label="CEP"
        inputMode="numeric"
        autoComplete="postal-code"
        format={formatPostalCode}
      />
      <Field {...props} field="address" label="Rua" autoComplete="address-line1" />
      <div className="grid grid-cols-2 gap-3">
        <Field {...props} field="addressNumber" label="Número" />
        <Field {...props} field="complement" label="Complemento (opcional)" />
      </div>
      <Field {...props} field="province" label="Bairro" />
    </div>
  );
}

function IncomeStep(props: StepProps) {
  return (
    <div className="grid gap-3">
      <Field
        {...props}
        field="monthlyIncome"
        label="Quanto entra por mês (R$)"
        hint="Um valor aproximado. Exemplo: 5.000,00. O Asaas pede para abrir a conta."
        inputMode="decimal"
      />
      <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
        <li>O SellBridge abre sua conta no Asaas com estes dados.</li>
        <li>Depois, você envia uma foto do documento e uma selfie no site do Asaas.</li>
        <li>O Asaas analisa em até 2 dias úteis.</li>
      </ul>
    </div>
  );
}

const STEP_VIEWS = [WhoStep, ContactStep, IncomeStep] as const;

function useOpenAccount(supplierId: string, onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: AsaasAccountValues) =>
      openAsaasAccountFn({ data: { supplierId, form: asaasAccountPayload(values) } }),
    onSuccess: async ({ protectedNow }) => {
      onDone();
      toast.success(
        protectedNow
          ? "Conta aberta no Asaas. Agora envie seus documentos."
          : "Conta aberta, mas a proteção não ligou. Toque em “Ligar a proteção” para tentar de novo.",
      );
      await queryClient.invalidateQueries({
        queryKey: asaasReceivingQueryOptions(supplierId).queryKey,
      });
    },
  });
}

function useStepFields(step: number) {
  const [values, setValues] = useState(EMPTY_ASAAS_ACCOUNT);
  const [errors, setErrors] = useState<Errors>({});
  const change = (field: AsaasAccountField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const check = (field: AsaasAccountField) => {
    // An untouched empty field waits for Continuar instead of nagging while the supplier tabs past.
    if (values[field].trim() === "") {
      return;
    }
    const found = stepErrors(values, step, new Date());
    setErrors((current) => ({ ...current, [field]: found[field] }));
  };
  return { values, errors, setErrors, change, check };
}

/** Opens the supplier's Asaas account in three short steps; nothing typed is lost between them. */
export function AsaasAccountDialog(props: {
  supplierId: string;
  companyOnly: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const { values, errors, setErrors, change, check } = useStepFields(step);
  const open = useOpenAccount(props.supplierId, () => props.onOpenChange(false));
  const isLast = step === ASAAS_ACCOUNT_STEPS.length - 1;
  const StepView = STEP_VIEWS[step] ?? WhoStep;
  const advance = () => {
    const found = stepErrors(values, step, new Date());
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    if (isLast) {
      open.mutate(values);
      return;
    }
    setStep(step + 1);
  };
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Abrir conta no Asaas</DialogTitle>
          <DialogDescription>
            Etapa {step + 1} de {ASAAS_ACCOUNT_STEPS.length}: {ASAAS_ACCOUNT_STEPS[step]?.title}
          </DialogDescription>
        </DialogHeader>
        <StepView
          values={values}
          errors={errors}
          change={change}
          check={check}
          companyOnly={props.companyOnly}
        />
        {open.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(open.error)}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="gap-2">
          {step > 0 ? (
            <Button variant="outline" size="lg" onClick={() => setStep(step - 1)}>
              Voltar
            </Button>
          ) : null}
          <Button size="lg" disabled={open.isPending} onClick={advance}>
            {open.isPending ? "Abrindo a conta…" : isLast ? "Abrir minha conta" : "Continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
