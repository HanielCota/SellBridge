import type { BlingOperation, BlingPaymentMethod } from "@sellbridge/marketplaces/bling";
import { formatCnpj } from "@sellbridge/shared/account-documents";
import {
  PAYMENT_SLOTS,
  paymentSlotLabel,
  type PaymentSlot,
  type ResellerBlingSettings,
} from "@sellbridge/shared/reseller-bling";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TonePill } from "@/components/data/tone-status";
import { FloatingTextField } from "@/components/form/floating-field";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { saveResellerBlingFn } from "@/features/reseller-bling/reseller-bling.functions";
import { RESELLER_BLING_QUERY_KEY } from "@/features/reseller-bling/reseller-bling.queries";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** Settings as the form holds them: select values are strings, "" while none is chosen. */
interface FormState {
  issueFromErp: boolean;
  operationId: string;
  cfopInState: string;
  cfopOutOfState: string;
  intermediaryCnpj: string;
  paymentMethods: Partial<Record<PaymentSlot, string>>;
}

const NONE = "nenhuma";
const MAIN_SLOTS: readonly PaymentSlot[] = ["pix", "boleto", "wallet"];
const CARD_SLOTS = PAYMENT_SLOTS.filter((slot) => !MAIN_SLOTS.includes(slot));
/** The sale operation's usual names in Bling: the likely pick before any choice. */
const LIKELY_SALE = [/venda.*ordem/i, /^venda/i];

function likelySale(operations: readonly BlingOperation[], chosen: number | null): string {
  if (chosen !== null) {
    return String(chosen);
  }
  for (const pattern of LIKELY_SALE) {
    const found = operations.find((operation) => pattern.test(operation.name));
    if (found !== undefined) {
      return String(found.id);
    }
  }
  return "";
}

function initialState(view: ResellerBlingFormProps["view"]): FormState {
  const { settings } = view;
  const paymentMethods: Partial<Record<PaymentSlot, string>> = {};
  for (const slot of PAYMENT_SLOTS) {
    paymentMethods[slot] = String(settings.paymentMethods[slot] ?? NONE);
  }
  return {
    issueFromErp: view.issueFromErp,
    operationId: likelySale(view.operations, settings.operationId),
    cfopInState: settings.cfopInState,
    cfopOutOfState: settings.cfopOutOfState,
    intermediaryCnpj: formatCnpj(settings.intermediaryCnpj),
    paymentMethods,
  };
}

function toSettings(state: FormState): ResellerBlingSettings {
  const paymentMethods: ResellerBlingSettings["paymentMethods"] = {};
  for (const slot of PAYMENT_SLOTS) {
    const chosen = state.paymentMethods[slot] ?? NONE;
    paymentMethods[slot] = chosen === NONE ? null : Number(chosen);
  }
  return {
    operationId: state.operationId === "" ? null : Number(state.operationId),
    cfopInState: state.cfopInState.trim(),
    cfopOutOfState: state.cfopOutOfState.trim(),
    intermediaryCnpj: state.intermediaryCnpj,
    paymentMethods,
  };
}

interface ResellerBlingFormProps {
  view: {
    issueFromErp: boolean;
    settings: ResellerBlingSettings;
    operations: readonly BlingOperation[];
    paymentMethods: readonly BlingPaymentMethod[];
  };
}

const ISSUE_CHOICES = [
  {
    value: false,
    label: "No meu sistema (envio o XML)",
    description: "Você emite a nota no seu sistema e envia o XML no pedido.",
  },
  {
    value: true,
    label: "Pelo meu Bling (automático)",
    description:
      "O SellBridge cria a nota no seu Bling, envia à SEFAZ e manda para o Mercado Livre.",
  },
] as const;

function IssueChoice(props: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-1 text-sm font-semibold">Como você emite a nota de venda?</legend>
      {ISSUE_CHOICES.map((choice) => {
        const descriptionId = `reseller-bling-issue-${String(choice.value)}-description`;
        return (
          <label
            key={String(choice.value)}
            className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-2xl border p-4 has-checked:border-2 has-checked:border-brand has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name="reseller-bling-issue"
              checked={props.value === choice.value}
              aria-describedby={descriptionId}
              onChange={() => props.onChange(choice.value)}
              className="mt-1 size-4 accent-brand"
            />
            <span className="text-sm font-medium">{choice.label}</span>
            <span id={descriptionId} className="col-start-2 text-sm text-muted-foreground">
              {choice.description}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

type Change = (patch: Partial<FormState>) => void;

function FiscalFields(props: {
  state: FormState;
  operations: readonly BlingOperation[];
  onChange: Change;
}) {
  const { state, onChange } = props;
  return (
    <fieldset className="grid gap-4">
      <legend className="mb-1 text-sm font-semibold">Dados da nota</legend>
      <SelectField
        id="reseller-bling-operation"
        label="Natureza de operação da venda"
        value={state.operationId}
        error={null}
        options={props.operations.map((operation) => ({
          value: String(operation.id),
          label: operation.name,
        }))}
        placeholder="Escolha a natureza"
        hint="No Bling, costuma se chamar “Venda à ordem” ou “Venda de mercadorias”."
        onValueChange={(operationId) => onChange({ operationId })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FloatingTextField
          id="reseller-bling-cfop-in-state"
          label="CFOP para o mesmo estado"
          inputMode="numeric"
          maxLength={4}
          value={state.cfopInState}
          errors={[]}
          hint="Padrão: 5120"
          onValueChange={(cfopInState) => onChange({ cfopInState })}
        />
        <FloatingTextField
          id="reseller-bling-cfop-out-of-state"
          label="CFOP para outro estado"
          inputMode="numeric"
          maxLength={4}
          value={state.cfopOutOfState}
          errors={[]}
          hint="Padrão: 6120"
          onValueChange={(cfopOutOfState) => onChange({ cfopOutOfState })}
        />
      </div>
      <FloatingTextField
        id="reseller-bling-intermediary"
        label="CNPJ do Mercado Livre (intermediador)"
        inputMode="numeric"
        value={state.intermediaryCnpj}
        errors={[]}
        hint="Padrão: 03.007.331/0001-41, o CNPJ que o Mercado Livre informa."
        onValueChange={(next) => onChange({ intermediaryCnpj: formatCnpj(next) })}
      />
    </fieldset>
  );
}

function PaymentSelect(props: {
  slot: PaymentSlot;
  state: FormState;
  methods: readonly BlingPaymentMethod[];
  onChange: Change;
}) {
  return (
    <SelectField
      id={`reseller-bling-payment-${props.slot}`}
      label={paymentSlotLabel(props.slot)}
      value={props.state.paymentMethods[props.slot] ?? NONE}
      error={null}
      options={[
        { value: NONE, label: "Nenhuma" },
        ...props.methods.map((method) => ({ value: String(method.id), label: method.name })),
      ]}
      onValueChange={(chosen) =>
        props.onChange({ paymentMethods: { ...props.state.paymentMethods, [props.slot]: chosen } })
      }
    />
  );
}

function PaymentFields(props: {
  state: FormState;
  methods: readonly BlingPaymentMethod[];
  onChange: Change;
}) {
  const linkedCards = CARD_SLOTS.filter(
    (slot) => (props.state.paymentMethods[slot] ?? NONE) !== NONE,
  );
  return (
    <fieldset className="grid gap-4">
      <legend className="mb-1 text-sm font-semibold">Formas de pagamento no seu Bling</legend>
      <p className="text-sm text-muted-foreground">
        A nota diz como o comprador pagou. Já ligamos as formas do seu Bling pelo tipo e pela
        bandeira; confira com o seu contador.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {MAIN_SLOTS.map((slot) => (
          <PaymentSelect key={slot} slot={slot} {...props} />
        ))}
      </div>
      <details className="group rounded-2xl border p-4">
        <summary className="min-h-11 cursor-pointer text-sm font-medium">
          Cartões de crédito e débito · {linkedCards.length} de {CARD_SLOTS.length} ligados
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {CARD_SLOTS.map((slot) => (
            <PaymentSelect key={slot} slot={slot} {...props} />
          ))}
        </div>
      </details>
    </fieldset>
  );
}

/** The reseller's choice and the sale note's settings, saved together. */
export function ResellerBlingForm({ view }: ResellerBlingFormProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState(() => initialState(view));
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: async (next: FormState) =>
      await saveResellerBlingFn({
        data: { issueFromErp: next.issueFromErp, settings: toSettings(next) },
      }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(RESELLER_BLING_QUERY_KEY, fresh);
      setSaved(true);
    },
  });
  const change: Change = (patch) => {
    setSaved(false);
    setState((current) => ({ ...current, ...patch }));
  };
  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(state);
      }}
    >
      <IssueChoice
        value={state.issueFromErp}
        onChange={(issueFromErp) => change({ issueFromErp })}
      />
      <div className={cn("grid gap-6", state.issueFromErp ? null : "opacity-80")}>
        <FiscalFields state={state} operations={view.operations} onChange={change} />
        <PaymentFields state={state} methods={view.paymentMethods} onChange={change} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="min-h-11" disabled={save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar"}
        </Button>
        {saved && !save.isPending ? <TonePill tone="success" label="Salvo" /> : null}
        {save.error === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(save.error)}
          </p>
        )}
      </div>
    </form>
  );
}
