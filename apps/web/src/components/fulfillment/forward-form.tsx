import {
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatCep } from "@sellbridge/shared/billing-address";
import { forwardOrderSchema, type DeliveryAddress } from "@sellbridge/shared/schemas";
import { toast } from "sonner";
import { StateField } from "@/components/admin-suppliers/state-field";
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
import { forwardBlockers } from "@/features/fulfillment/forward-blockers";
import { forwardOrderFn } from "@/features/fulfillment/fulfillment.functions";
import { addressImportNeeded } from "@/features/fulfillment/address-import-needed";
import { marketplaceAddressNote } from "@/features/fulfillment/marketplace-address-note";
import { getMarketplaceShippingFn } from "@/features/fulfillment/marketplace.functions";
import { payLaterSentence } from "@/features/orders/order-next-step";
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
  state: "Estado",
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
  const { address, loadAddress, forward } = form;
  const marketplaceImport = detail.order.marketplace === "mercado_livre" ? loadAddress : null;
  useAutomaticAddressLookup(detail.order.marketplaceAddress, marketplaceImport);
  const ownsItems = detail.items.some((item) => item.catalogKind === "seller");
  const blockers = forwardBlockers(detail.items);
  const unmapped = blockers.length > 0;
  return (
    // The order page's "Enviar ao fornecedor" lands here.
    <form
      id="forward-form"
      tabIndex={-1}
      noValidate
      className="scroll-mt-24 space-y-4 outline-none"
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
        onAddress={(found) => form.importAddress((previous) => ({ ...previous, ...found }))}
        marketplaceImport={marketplaceImport}
        lookupNote={form.lookupNote}
      />
      <AddressFields
        address={address}
        errors={form.errors}
        onChange={form.changeField}
        onCepAddress={form.applyCepAddress}
      />
      <NotesField form={form} ownsItems={ownsItems} />
      {unmapped ? <ForwardBlockersNotice blockers={blockers} /> : null}
      <ForwardButton
        pending={forward.isPending}
        ownsItems={ownsItems}
        blocked={unmapped || detail.order.status !== "paid"}
      />
      <PreparationExplanation ownsItems={ownsItems} payLater={payLaterSentence(detail.items)} />
    </form>
  );
}

/** Optional: most orders go without a word to the supplier. */
function NotesField({
  form,
  ownsItems,
}: {
  form: ReturnType<typeof useForwardForm>;
  ownsItems: boolean;
}) {
  const { notes } = form;
  return (
    <Field
      id={`${FIELD_ID_PREFIX}notes`}
      label={
        ownsItems ? "Instruções de envio (opcional)" : "Instruções para o fornecedor (opcional)"
      }
      placeholder="Ex.: embalar para presente"
      value={notes}
      // Pointed out when leaving the field or sending: a long order number looks like a phone
      // until it is typed in full.
      error={form.errors.notes ?? (form.notesChecked ? contactWarning(notes) : null)}
      onBlur={() => form.setNotesChecked(true)}
      onChange={form.changeNotes}
    />
  );
}

/** Why the order cannot be forwarded, item by item, and where to get it solved. */
function ForwardBlockersNotice({ blockers }: { blockers: readonly string[] }) {
  return (
    <div role="alert" className="grid gap-2 rounded-2xl bg-destructive/10 p-3 text-sm">
      <p className="font-medium text-destructive">Este pedido não pode ser encaminhado agora:</p>
      <ul className="grid list-disc gap-1 pl-5">
        {blockers.map((blocker) => (
          <li key={blocker}>{blocker}</li>
        ))}
      </ul>
      <p>
        Cancele o pedido no marketplace ou abra um chamado para a equipe resolver.{" "}
        <Link to="/suporte/novo" className="font-medium underline underline-offset-4">
          Abrir chamado
        </Link>
      </p>
    </div>
  );
}

/**
 * Where the address came from. When the marketplace sent it with the order, a note says so; the
 * label reader and the import stay for orders that came without one or with an incomplete one
 * (docs/marketplaces/order-shipping-address.md).
 */
function AddressSource({
  order,
  lookupNote,
  ...importBar
}: { order: Detail["order"]; lookupNote: string | null } & ComponentProps<
  typeof AddressImportBar
>) {
  const filledByMarketplace = order.marketplaceAddress !== null;
  return (
    <>
      {filledByMarketplace ? (
        <p className="text-sm text-muted-foreground">{marketplaceAddressNote(order.marketplace)}</p>
      ) : null}
      {lookupNote === null ? null : (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {lookupNote}
        </p>
      )}
      {addressImportNeeded(order.marketplaceAddress) ? <AddressImportBar {...importBar} /> : null}
    </>
  );
}

/**
 * An order from Mercado Livre that came without a complete address asks for it once, on
 * opening: the reseller should not have to find the button that does it.
 */
function useAutomaticAddressLookup(
  marketplaceAddress: Detail["order"]["marketplaceAddress"],
  marketplaceImport: { mutate: () => void } | null,
) {
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || marketplaceImport === null || !addressImportNeeded(marketplaceAddress)) {
      return;
    }
    asked.current = true;
    marketplaceImport.mutate();
  }, [marketplaceAddress, marketplaceImport]);
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

/** What happens after the click, money first: forwarding is free, the payment comes next. */
function PreparationExplanation({
  ownsItems,
  payLater,
}: {
  ownsItems: boolean;
  payLater: string | null;
}) {
  const split = ownsItems
    ? "Você prepara e envia seus produtos; cada fornecedor recebe apenas os itens dele."
    : "Cada fornecedor recebe só os itens dele e vê o pedido no painel. Se ainda não tiver painel, aparece aqui o link para você mandar a ele.";
  return (
    <div className="space-y-1 text-sm">
      {payLater === null ? null : (
        <p className="font-medium">
          {payLater} O dinheiro fica guardado e só vai para o fornecedor depois da entrega.
        </p>
      )}
      <p className="text-xs text-muted-foreground">{split}</p>
    </div>
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
  const editing = useAddressEditing(setAddress, setNotes);
  const { errors, setErrors, importAddress } = editing;
  const { loadAddress, lookupNote } = useMarketplaceAddress(detail.order.id, importAddress);
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
    lookupNote,
    importAddress,
    notes,
    notesChecked,
    setNotesChecked,
    loadAddress,
    forward,
    errors,
    submit,
    changeField: editing.changeField,
    changeNotes: editing.changeNotes,
    applyCepAddress: editing.applyCepAddress,
  };
}

/** The buyer's address read from Mercado Livre, with a line saying what came back. */
function useMarketplaceAddress(
  orderId: string,
  importAddress: (address: SetStateAction<DeliveryAddress>) => void,
) {
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const loadAddress = useMutation({
    mutationFn: () => getMarketplaceShippingFn({ data: { orderId } }),
    onSuccess: (result) => {
      if (result.address) {
        importAddress(result.address);
        setLookupNote("Endereço do comprador trazido do Mercado Livre. Confira antes de enviar.");
        return;
      }
      setLookupNote(MISSING_ADDRESS_NOTE);
    },
    // The marketplace's own reason ("Número de pedido inválido") means nothing to the reseller,
    // and what to do next is the same either way.
    onError: () => setLookupNote(LOOKUP_FAILED_NOTE),
  });
  return { loadAddress, lookupNote };
}

/** Typing in a field, or a CEP that filled some, takes their old problem away. */
function useAddressEditing(
  setAddress: Dispatch<SetStateAction<DeliveryAddress>>,
  setNotes: (notes: string) => void,
) {
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
  /** An address brought in from elsewhere takes the old address problems away with it. */
  function importAddress(next: SetStateAction<DeliveryAddress>) {
    setAddress(next);
    setErrors((previous) => clearForwardErrors(previous, ADDRESS_KEYS));
  }
  function changeNotes(value: string) {
    setNotes(value);
    setErrors((previous) => clearForwardErrors(previous, ["notes"]));
  }
  return { errors, setErrors, changeField, applyCepAddress, importAddress, changeNotes };
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
      {ADDRESS_KEYS.map((key) =>
        key === "state" ? (
          <StateSelectField
            key={key}
            value={address.state}
            error={errors.state ?? null}
            onChange={(value) => onChange("state", value)}
          />
        ) : (
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
              onChange(key, value);
            }}
          />
        ),
      )}
    </div>
  );
}

/** The state from the list, as in the profile: no guessing between "SP" and "São Paulo". */
function StateSelectField({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const id = `${FIELD_ID_PREFIX}state`;
  return (
    <div className="grid gap-2">
      <StateField
        id={id}
        label={ADDRESS_LABELS.state}
        value={value.toUpperCase()}
        onChange={onChange}
      />
      {error === null ? null : (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

const CEP_HINT = "Digite o CEP: rua, bairro e cidade vêm sozinhos.";
const MISSING_ADDRESS_NOTE =
  "O Mercado Livre não mandou o endereço completo. Suba a etiqueta ou digite o CEP para preencher.";
const LOOKUP_FAILED_NOTE =
  "Não conseguimos buscar o endereço no Mercado Livre agora. Suba a etiqueta ou digite o CEP para preencher.";
