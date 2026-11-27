import { FEE_CHANNEL_OWNERS } from "@sellbridge/shared/channel-fees";
import { formatCents } from "@sellbridge/shared/money";
import {
  MANUAL_SALE_CHANNEL_LABELS,
  MANUAL_SALE_CHANNELS,
  type ManualSale,
  type ManualSaleChannel,
} from "@sellbridge/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { TextField } from "@/components/form/form-field";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import {
  addDraftItem,
  draftEstimatedFeeCents,
  draftFeeField,
  draftTotalCents,
  type DraftErrors,
  EMPTY_MANUAL_SALE,
  type ManualSaleDraft,
  maskFeeInput,
  readManualSale,
  removeDraftItem,
  updateDraftItem,
  withoutErrors,
} from "@/features/manual-sales/manual-sale-draft";
import { recordManualSaleFn } from "@/features/manual-sales/manual-sale.functions";
import { errorMessage } from "@/lib/errors";
import { PRODUCT_SEARCH_ID, ProductSearch, SaleItemRow } from "./manual-sale-products";

const CHANNEL_OPTIONS = MANUAL_SALE_CHANNELS.map((channel) => ({
  value: channel,
  label: MANUAL_SALE_CHANNEL_LABELS[channel],
}));

function isChannel(value: string): value is ManualSaleChannel {
  return MANUAL_SALE_CHANNELS.some((channel) => channel === value);
}

/** The field to focus for an error key: "items" is the product search. */
function fieldIdOf(errorKey: string): string {
  if (errorKey === "items") {
    return PRODUCT_SEARCH_ID;
  }
  return `manual-sale-${errorKey.replaceAll(".", "-")}`;
}

function focusFirstError(errors: DraftErrors): void {
  const [first] = Object.keys(errors);
  if (first === undefined) {
    return;
  }
  document.getElementById(fieldIdOf(first))?.focus();
}

function useRecordManualSale() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (sale: ManualSale) => recordManualSaleFn({ data: sale }),
    onSuccess: async ({ orderId }) => {
      toast.success("Venda registrada", {
        description: "Agora suba a etiqueta e envie o pedido ao fornecedor.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["operations"] }),
        queryClient.invalidateQueries({ queryKey: ["billing"] }),
      ]);
      await navigate({ to: "/pedidos/$orderId", params: { orderId } });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function errorList(message: string | undefined): string[] {
  return message === undefined ? [] : [message];
}

/** Where the sale happened, its number and the buyer, as on the channel's order and label. */
function SaleDetails({
  draft,
  errors,
  onChange,
}: {
  draft: ManualSaleDraft;
  errors: DraftErrors;
  onChange: (patch: Partial<ManualSaleDraft>) => void;
}) {
  const channelLabel = MANUAL_SALE_CHANNEL_LABELS[draft.channel];
  return (
    <section aria-labelledby="manual-sale-details" className="space-y-4">
      <h2 id="manual-sale-details" className="text-subhead font-semibold">
        A venda
      </h2>
      <SelectField
        id="manual-sale-channel"
        label="Onde foi a venda"
        value={draft.channel}
        error={errors.channel ?? null}
        options={CHANNEL_OPTIONS}
        onValueChange={(channel) => (isChannel(channel) ? onChange({ channel }) : undefined)}
      />
      <TextField
        id="manual-sale-externalOrderId"
        label="Número do pedido"
        placeholder={`Como aparece no pedido da ${channelLabel}`}
        autoComplete="off"
        value={draft.externalOrderId}
        errors={errorList(errors.externalOrderId)}
        onValueChange={(externalOrderId) => onChange({ externalOrderId })}
      />
      <TextField
        id="manual-sale-buyerName"
        label="Nome do comprador"
        placeholder="Como está na etiqueta"
        autoComplete="off"
        value={draft.buyerName}
        errors={errorList(errors.buyerName)}
        onValueChange={(buyerName) => onChange({ buyerName })}
      />
    </section>
  );
}

function SaleProducts({
  draft,
  errors,
  onDraftChange,
}: {
  draft: ManualSaleDraft;
  errors: DraftErrors;
  onDraftChange: (next: ManualSaleDraft) => void;
}) {
  const chosenIds = new Set(draft.items.map((item) => item.productId));
  return (
    <section aria-labelledby="manual-sale-products" className="space-y-4">
      <h2 id="manual-sale-products" className="text-subhead font-semibold">
        Produtos vendidos
      </h2>
      {draft.items.length === 0 ? null : (
        <ul aria-label="Produtos da venda" className="grid gap-3">
          {draft.items.map((item, index) => (
            <SaleItemRow
              key={item.productId}
              item={item}
              index={index}
              errors={errors}
              onChange={(patch) => onDraftChange(updateDraftItem(draft, item.productId, patch))}
              onRemove={() => onDraftChange(removeDraftItem(draft, item.productId))}
            />
          ))}
        </ul>
      )}
      <ProductSearch
        error={errors.items}
        chosenIds={chosenIds}
        onAdd={(product) => onDraftChange(addDraftItem(draft, product))}
      />
    </section>
  );
}

const FEE_ERROR_KEY = "marketplaceFeeCents";
const FEE_FIELD_ID = `manual-sale-${FEE_ERROR_KEY}`;
const FEE_NOTE_ID = "manual-sale-fee-note";

/** Where the fee field's value came from: the channel's table, or what the reseller typed. */
function feeNote(draft: ManualSaleDraft, estimate: number | null): string {
  const owner = FEE_CHANNEL_OWNERS[draft.channel];
  if (draft.fee === null) {
    return `Calculada pela tabela ${owner} para estes preços. Confira no pedido ${owner} e corrija se for diferente.`;
  }
  if (estimate === null) {
    return `Valor que você digitou, do pedido ${owner}.`;
  }
  return `Valor que você digitou. Pela tabela ${owner}, daria ${formatCents(estimate)}.`;
}

/**
 * What the channel keeps of the sale, already estimated from its table; the reseller corrects it
 * with the value on the channel's order, and the profit counts it.
 */
function SaleFee({
  draft,
  error,
  onFeeChange,
}: {
  draft: ManualSaleDraft;
  error: string | undefined;
  onFeeChange: (fee: string | null) => void;
}) {
  const estimate = draftEstimatedFeeCents(draft);
  const describedBy = error === undefined ? FEE_NOTE_ID : `${FEE_FIELD_ID}-error ${FEE_NOTE_ID}`;
  return (
    <section aria-label="Taxa do marketplace" className="space-y-2">
      <TextField
        id={FEE_FIELD_ID}
        label={`Taxa ${FEE_CHANNEL_OWNERS[draft.channel]} (R$)`}
        inputMode="numeric"
        value={draftFeeField(draft)}
        errors={errorList(error)}
        aria-describedby={describedBy}
        onValueChange={(typed) => onFeeChange(maskFeeInput(typed))}
      />
      <p id={FEE_NOTE_ID} className="text-footnote text-muted-foreground">
        {feeNote(draft, estimate)}
      </p>
      {draft.fee === null || estimate === null ? null : (
        <Button type="button" variant="outline" size="sm" onClick={() => onFeeChange(null)}>
          Usar o cálculo da tabela
        </Button>
      )}
    </section>
  );
}

function SaleFooter({ total, pending }: { total: number | null; pending: boolean }) {
  return (
    <div className="grid gap-3 border-t pt-4 sm:flex sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Total da venda:{" "}
        <span className="font-semibold text-foreground">
          {total === null ? "confira as quantidades e os preços" : formatCents(total)}
        </span>
      </p>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Registrando…" : "Registrar venda"}
      </Button>
    </div>
  );
}

/** Registers a Shopee or TikTok Shop sale by hand, then opens it to upload the label and forward. */
export function ManualSaleForm() {
  const [draft, setDraft] = useState<ManualSaleDraft>(EMPTY_MANUAL_SALE);
  const [errors, setErrors] = useState<DraftErrors>({});
  const mutation = useRecordManualSale();
  // A message goes away as soon as its field changes; the rest wait for the next try.
  const changeDraft = (next: ManualSaleDraft, changedFields: readonly string[]) => {
    setDraft(next);
    setErrors((current) => withoutErrors(current, changedFields));
  };
  const submit = () => {
    const result = readManualSale(draft);
    if (result.errors !== null) {
      setErrors(result.errors);
      focusFirstError(result.errors);
      return;
    }
    setErrors({});
    mutation.mutate(result.sale);
  };
  return (
    <form
      noValidate
      className="max-w-2xl space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <SaleDetails
        draft={draft}
        errors={errors}
        onChange={(patch) =>
          changeDraft({ ...draft, ...patch }, [...Object.keys(patch), FEE_ERROR_KEY])
        }
      />
      <SaleProducts
        draft={draft}
        errors={errors}
        onDraftChange={(next) => changeDraft(next, ["items", FEE_ERROR_KEY])}
      />
      {draft.items.length === 0 ? null : (
        <SaleFee
          draft={draft}
          error={errors[FEE_ERROR_KEY]}
          onFeeChange={(fee) => changeDraft({ ...draft, fee }, [FEE_ERROR_KEY])}
        />
      )}
      <SaleFooter total={draftTotalCents(draft)} pending={mutation.isPending} />
    </form>
  );
}
