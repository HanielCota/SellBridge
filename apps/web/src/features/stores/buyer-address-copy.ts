import type { BuyerAddressResult } from "@sellbridge/shared/buyer-address";
import type { StatusTone } from "@/components/data/tone-status";

/** What a store's purchase address notice says; kept apart from the component to test it alone. */
export interface BuyerAddressNoticeCopy {
  tone: Extract<StatusTone, "danger" | "warning">;
  /** The status pill: what is wrong, in the reseller's words. */
  label: string;
  /** What happens because of it, and what to do in the marketplace. */
  paragraphs: readonly string[];
}

const HOW_TO_FIX =
  "No Mercado Livre, em Meus dados › Endereços, deixe a sua casa como endereço de compra. O endereço do fornecedor fica só para envio e devolução.";

/** Null when there is nothing to tell: the address is fine or was never read. */
export function buyerAddressNoticeCopy(
  result: BuyerAddressResult | null,
  supplierName: string | null,
): BuyerAddressNoticeCopy | null {
  if (result === "supplier_address") {
    const destination = supplierName === null ? "no fornecedor" : `em ${supplierName}`;
    return {
      tone: "danger",
      label: "Compras indo para o fornecedor",
      paragraphs: [
        `As compras pessoais desta conta vão chegar ${destination}. ${HOW_TO_FIX}`,
        "Até lá, a loja continua vendendo, mas não publica produtos novos.",
      ],
    };
  }
  if (result === "shipping_address") {
    return {
      tone: "warning",
      label: "Confira o endereço de compra",
      paragraphs: [
        `O endereço de compra desta conta é o mesmo de onde saem os envios. Se os envios saem do fornecedor, as suas compras vão para ele. ${HOW_TO_FIX}`,
      ],
    };
  }
  if (result === "no_buying_address") {
    return {
      tone: "warning",
      label: "Sem endereço de compra",
      paragraphs: [`Esta conta não tem um endereço de compra marcado. ${HOW_TO_FIX}`],
    };
  }
  return null;
}

export interface RecheckOutcomeCopy {
  kind: "success" | "warning" | "error";
  title: string;
  description?: string;
}

/** The toast after "Já arrumei, conferir de novo". */
export function recheckOutcomeCopy(result: BuyerAddressResult): RecheckOutcomeCopy {
  if (result === "supplier_address") {
    return {
      kind: "error",
      title: "Ainda está no endereço do fornecedor",
      description: "Troque o endereço de compra no Mercado Livre e confira de novo.",
    };
  }
  if (result === "not_checked") {
    return {
      kind: "warning",
      title: "Não deu para conferir agora",
      description: "O Mercado Livre não respondeu. Tente de novo em alguns minutos.",
    };
  }
  if (result === "ok") {
    return {
      kind: "success",
      title: "Endereço de compra certo",
      description: "A loja pode publicar.",
    };
  }
  return {
    kind: "warning",
    title: "Conferido",
    description: "A loja pode publicar, mas veja o aviso no cartão dela.",
  };
}
