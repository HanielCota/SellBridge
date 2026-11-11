import { type ComponentProps, type Dispatch, type SetStateAction, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatCep } from "@sellbridge/shared/billing-address";
import { forwardOrderSchema, type DeliveryAddress } from "@sellbridge/shared/schemas";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CepAddress } from "@/features/cities/cep-lookup";
import { useCepAutofill } from "@/features/cities/use-cep-autofill";
import { contactWarning } from "@/features/fulfillment/contact-warning";
import {
  clearForwardErrors,
  type ForwardErrors,
  firstForwardErrorField,
  forwardErrorsByField,
} from "@/features/fulfillment/forward-errors";
import { forwardOrderFn } from "@/features/fulfillment/fulfillment.functions";
import { addressImportNeeded } from "@/features/fulfillment/address-import-needed";
import { marketplaceAddressNote } from "@/features/fulfillment/marketplace-address-note";
import { getMarketplaceShippingFn } from "@/features/fulfillment/marketplace.functions";
import { errorMessage } from "@/lib/errors";
import { AddressImportBar } from "./label-import";
import { Field } from "./shipment-field";

type Detail = Awaited<
  ReturnType<typeof import("@/features/fulfillment/fulfillment.functions").getFulfillmentFn>
>;

/**
 * Forwarding an order: the buyer's address, the instructions for the supplier and the button
 * that creates the supplier orders (split out of order-dialog.tsx, which passed 500 lines).
 */
const ADDRESS_KEYS = [
  "recipient",
  "postalCode",
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
] as const;
const ADDRESS_LABELS: Record<keyof DeliveryAddress, string> = {
  recipient: "Destinatário",
  street: "Rua",
  number: "Número",
  complement: "Complemento",
  neighborhood: "Bairro",
  city: "Cidade",
  state: "UF",
  postalCode: "CEP",
};
/**
 * Limits and the phone keyboard for the fields that need them (a house number can be "s/n", so it
 * keeps the full keyboard). Autofill stays off: the browser would offer the reseller's own
 * addresses, and this is the buyer's.
 */
const ADDRESS_INPUTS: Partial<
  Record<
    keyof DeliveryAddress,
    Pick<ComponentProps<"input">, "inputMode" | "maxLength" | "placeholder">
  >
> = {
  state: { maxLength: 2 },
  postalCode: { inputMode: "numeric", maxLength: 9, placeholder: "00000-000" },
};
const FIELD_ID_PREFIX = "forward-";
export function ForwardForm({
  detail,
  onForwarded,
}: {
  detail: Detail;
  onForwarded: (links: Awaited<ReturnType<typeof forwardOrderFn>>) => Promise<void>;
}) {
  const form = useForwardForm(detail, onForwarded);
  const { address, setAddress, notes, setNotes, loadAddress, forward } = form;
  const ownsItems = detail.items.some((item) => item.catalogKind === "seller");
  const unmapped = !detail.items.length || detail.items.some((item) => !item.supplierId);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.submit();
      }}
    >
      {/* Forwarding creates the supplier orders. Enter in an address field would submit the form
          through its first submit button; this disabled one comes first, so only a click sends. */}
      <button type="submit" disabled hidden aria-hidden="true" />
      <ForwardItems detail={detail} />
      <AddressSource
        order={detail.order}
        onAddress={(found) => setAddress((previous) => ({ ...previous, ...found }))}
        marketplaceImport={detail.order.marketplace === "mercado_livre" ? loadAddress : null}
      />
      <AddressFields
        address={address}
        errors={form.errors}
        onChange={form.changeField}
        onCepAddress={form.applyCepAddress}
      />
      <Field
        label={ownsItems ? "Instruções de envio" : "Instruções para o fornecedor"}
        value={notes}
        // Pointed out when leaving the field or sending: a long order number looks like a phone
        // until it is typed in full.
        error={form.notesChecked ? contactWarning(notes) : null}
        onBlur={() => form.setNotesChecked(true)}
        onChange={setNotes}
      />
      {unmapped ? (
        <p className="text-sm text-destructive">
          Um item deste pedido não é de um fornecedor ativo do SellBridge: encaminhe-o por fora.
        </p>
      ) : null}
      <ForwardButton
        pending={forward.isPending}
        ownsItems={ownsItems}
        blocked={unmapped || detail.order.status !== "paid"}
      />
      <PreparationExplanation ownsItems={ownsItems} />
    </form>
  );
}

/**
 * Where the address came from. When the marketplace sent it with the order, a note says so; the
 * label reader and the import stay for orders that came without one or with an incomplete one
 * (docs/marketplaces/order-shipping-address.md).
 */
function AddressSource({
  order,
  ...importBar
}: { order: Detail["order"] } & ComponentProps<typeof AddressImportBar>) {
  const filledByMarketplace = order.marketplaceAddress !== null;
  return (
    <>
      {filledByMarketplace ? (
        <p className="text-sm text-muted-foreground">{marketplaceAddressNote(order.marketplace)}</p>
      ) : null}
      {addressImportNeeded(order.marketplaceAddress) ? <AddressImportBar {...importBar} /> : null}
    </>
  );
}

function ForwardButton({
  pending,
  ownsItems,
  blocked,
}: {
  pending: boolean;
  ownsItems: boolean;
  blocked: boolean;
}) {
  const idleLabel = ownsItems ? "Preparar envios" : "Enviar pedido ao fornecedor";
  return (
    // The label is long: on a narrow phone it wraps inside the button instead of overflowing.
    <Button
      type="submit"
      className="h-auto min-h-9 w-full py-2 text-balance whitespace-normal sm:w-auto"
      disabled={pending || blocked}
    >
      {pending ? "Enviando…" : idleLabel}
    </Button>
  );
}

function PreparationExplanation({ ownsItems }: { ownsItems: boolean }) {
  return (
    <p className="text-xs text-muted-foreground">
      {ownsItems
        ? "Você prepara e envia seus produtos; cada fornecedor recebe apenas os itens dele."
        : "Cada fornecedor recebe só os itens dele. Depois de enviar, aparece o link do pedido para você mandar ao fornecedor."}
    </p>
  );
}

function useForwardForm(
  detail: Detail,
  onForwarded: (links: Awaited<ReturnType<typeof forwardOrderFn>>) => Promise<void>,
) {
  const [address, setAddress] = useState<DeliveryAddress>(
    () => detail.order.marketplaceAddress ?? emptyAddress(detail.order.buyerName),
  );
  const [notes, setNotes] = useState("");
  const editing = useAddressEditing(setAddress);
  const { errors, setErrors } = editing;
  const loadAddress = useMutation({
    mutationFn: () => getMarketplaceShippingFn({ data: { orderId: detail.order.id } }),
    onSuccess: (result) => {
      if (result.address) {
        setAddress(result.address);
        return;
      }
      toast.error("O marketplace não informou o endereço completo");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const forward = useMutation({
    mutationFn: async () => {
      // The server's own schema, so a phone in the instructions is refused before it is sent.
      const parsed = forwardOrderSchema.safeParse({ orderId: detail.order.id, address, notes });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Confira o endereço");
      return forwardOrderFn({ data: parsed.data });
    },
    onSuccess: onForwarded,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const [notesChecked, setNotesChecked] = useState(false);
  function submit() {
    setNotesChecked(true);
    if (contactWarning(notes) !== null) {
      return;
    }
    const found = checkForward(detail.order.id, address, notes);
    setErrors(found);
    const first = firstForwardErrorField(found);
    if (first !== null) {
      document.getElementById(`${FIELD_ID_PREFIX}${first}`)?.focus();
      return;
    }
    forward.mutate();
  }
  return {
    address,
    setAddress,
    notes,
    setNotes,
    notesChecked,
    setNotesChecked,
    loadAddress,
    forward,
    errors,
    submit,
    changeField: editing.changeField,
    applyCepAddress: editing.applyCepAddress,
  };
}

/** Typing in a field, or a CEP that filled some, takes their old problem away. */
function useAddressEditing(setAddress: Dispatch<SetStateAction<DeliveryAddress>>) {
  const [errors, setErrors] = useState<ForwardErrors>({});
  function changeField(key: keyof DeliveryAddress, value: string) {
    setAddress((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => clearForwardErrors(previous, [key]));
  }
  function applyCepAddress(found: CepAddress) {
    const { street, neighborhood, city, state } = found;
    setAddress((previous) => ({ ...previous, street, neighborhood, city, state }));
    setErrors((previous) =>
      clearForwardErrors(previous, ["street", "neighborhood", "city", "state"]),
    );
  }
  return { errors, setErrors, changeField, applyCepAddress };
}

/** The server's own schema, checked before sending: each problem goes under its field. */
function checkForward(orderId: string, address: DeliveryAddress, notes: string): ForwardErrors {
  const parsed = forwardOrderSchema.safeParse({ orderId, address, notes });
  return parsed.success ? {} : forwardErrorsByField(parsed.error.issues);
}

function emptyAddress(buyerName: string | null): DeliveryAddress {
  return {
    recipient: buyerName ?? "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    postalCode: "",
  };
}

function ForwardItems({ detail }: { detail: Detail }) {
  return (
    <ul className="space-y-2 text-sm">
      {detail.items.map((item) => (
        <li key={item.id}>
          {item.quantity} × {item.title} ·{" "}
          <span className={item.supplierId ? "text-muted-foreground" : "text-destructive"}>
            {item.catalogKind === "seller"
              ? "Você envia este item"
              : (item.supplierName ?? "Sem fornecedor vinculado")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AddressFields({
  address,
  errors,
  onChange,
  onCepAddress,
}: {
  address: DeliveryAddress;
  errors: ForwardErrors;
  onChange: (key: keyof DeliveryAddress, value: string) => void;
  onCepAddress: (address: CepAddress) => void;
}) {
  const cep = useCepAutofill(onCepAddress);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ADDRESS_KEYS.map((key) => (
        <Field
          key={key}
          id={`${FIELD_ID_PREFIX}${key}`}
          label={ADDRESS_LABELS[key]}
          autoComplete="off"
          {...ADDRESS_INPUTS[key]}
          value={address[key]}
          error={errors[key] ?? null}
          hint={key === "postalCode" ? (cep.message ?? CEP_HINT) : null}
          onChange={(value) => {
            if (key === "postalCode") {
              const masked = formatCep(value);
              onChange(key, masked);
              void cep.lookUp(masked);
              return;
            }
            onChange(key, key === "state" ? value.toUpperCase() : value);
          }}
        />
      ))}
    </div>
  );
}

const CEP_HINT = "Digite o CEP: rua, bairro e cidade vêm sozinhos.";
