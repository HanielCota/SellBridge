import { type ComponentProps, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { forwardOrderSchema, type DeliveryAddress } from "@sellbridge/shared/schemas";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { contactWarning } from "@/features/fulfillment/contact-warning";
import { forwardOrderFn } from "@/features/fulfillment/fulfillment.functions";
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
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "postalCode",
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
  Record<keyof DeliveryAddress, Pick<ComponentProps<"input">, "inputMode" | "maxLength">>
> = {
  state: { maxLength: 2 },
  postalCode: { inputMode: "numeric", maxLength: 9 },
};
export function ForwardForm({
  detail,
  onForwarded,
}: {
  detail: Detail;
  onForwarded: (links: Awaited<ReturnType<typeof forwardOrderFn>>) => Promise<void>;
}) {
  const { address, setAddress, notes, setNotes, loadAddress, forward } = useForwardForm(
    detail,
    onForwarded,
  );
  const [notesChecked, setNotesChecked] = useState(false);
  const ownsItems = detail.items.some((item) => item.catalogKind === "seller");
  const unmapped = !detail.items.length || detail.items.some((item) => !item.supplierId);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setNotesChecked(true);
        if (contactWarning(notes) === null) {
          forward.mutate();
        }
      }}
    >
      {/* Forwarding creates the supplier orders. Enter in an address field would submit the form
          through its first submit button; this disabled one comes first, so only a click sends. */}
      <button type="submit" disabled hidden aria-hidden="true" />
      <ForwardItems detail={detail} />
      <AddressImportBar
        onAddress={(found) => setAddress((previous) => ({ ...previous, ...found }))}
        marketplaceImport={detail.order.marketplace === "mercado_livre" ? loadAddress : null}
      />
      <AddressFields
        address={address}
        onChange={(key, value) => setAddress((previous) => ({ ...previous, [key]: value }))}
      />
      <Field
        label={ownsItems ? "Instruções de envio" : "Instruções para o fornecedor"}
        value={notes}
        // Pointed out when leaving the field or sending: a long order number looks like a phone
        // until it is typed in full.
        error={notesChecked ? contactWarning(notes) : null}
        onBlur={() => setNotesChecked(true)}
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

function ForwardButton({
  pending,
  ownsItems,
  blocked,
}: {
  pending: boolean;
  ownsItems: boolean;
  blocked: boolean;
}) {
  const idleLabel = ownsItems ? "Preparar envios" : "Criar ordens e encaminhar aos fornecedores";
  return (
    // The label is long: on a narrow phone it wraps inside the button instead of overflowing.
    <Button
      type="submit"
      className="h-auto min-h-9 w-full py-2 text-balance whitespace-normal sm:w-auto"
      disabled={pending || blocked}
    >
      {pending ? "Preparando…" : idleLabel}
    </Button>
  );
}

function PreparationExplanation({ ownsItems }: { ownsItems: boolean }) {
  return (
    <p className="text-xs text-muted-foreground">
      {ownsItems
        ? "Você prepara e envia seus produtos; cada fornecedor recebe apenas os itens dele."
        : "Cada fornecedor recebe apenas os itens dele. Compartilhe o link de acesso exibido em cada envio do fornecedor."}
    </p>
  );
}

function useForwardForm(
  detail: Detail,
  onForwarded: (links: Awaited<ReturnType<typeof forwardOrderFn>>) => Promise<void>,
) {
  const [address, setAddress] = useState<DeliveryAddress>({
    recipient: detail.order.buyerName ?? "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    postalCode: "",
  });
  const [notes, setNotes] = useState("");
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
  return { address, setAddress, notes, setNotes, loadAddress, forward };
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
  onChange,
}: {
  address: DeliveryAddress;
  onChange: (key: keyof DeliveryAddress, value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ADDRESS_KEYS.map((key) => (
        <Field
          key={key}
          label={ADDRESS_LABELS[key]}
          autoComplete="off"
          {...ADDRESS_INPUTS[key]}
          value={address[key]}
          onChange={(value) => onChange(key, key === "state" ? value.toUpperCase() : value)}
        />
      ))}
    </div>
  );
}
