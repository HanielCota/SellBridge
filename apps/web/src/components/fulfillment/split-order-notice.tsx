import { PackageIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Mercado Livre gives one label per order: an order split into parcels cannot use it. */
const SINGLE_LABEL_MARKETPLACE = "mercado_livre";

const NOTICE_CLASS = "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200";

/** What the reseller reads on an order whose products come from more than one supplier. */
export function splitOrderText(parcelCount: number, marketplace: string): string {
  const who = `Este pedido tem produtos de ${parcelCount.toLocaleString("pt-BR")} fornecedores, e cada um envia a sua parte.`;
  if (marketplace !== SINGLE_LABEL_MARKETPLACE) {
    return who;
  }
  return `${who} A etiqueta do Mercado Livre vale para um pacote só, então cada fornecedor envia com o próprio frete e informa o rastreio.`;
}

/** On the reseller's order: the order goes out in several parcels, one per supplier. */
export function SplitOrderNotice({
  parcelCount,
  marketplace,
}: {
  parcelCount: number;
  marketplace: string;
}) {
  if (parcelCount < 2) {
    return null;
  }
  return (
    <Alert className={NOTICE_CLASS}>
      <PackageIcon weight="fill" aria-hidden="true" />
      <AlertTitle>Pedido dividido entre fornecedores</AlertTitle>
      <AlertDescription className="text-current">
        {splitOrderText(parcelCount, marketplace)}
      </AlertDescription>
    </Alert>
  );
}

/**
 * On the supplier's parcel: its Mercado Livre label would also have to serve another supplier's
 * parcel, from the same order or the same cart, so the supplier ships with their own freight.
 */
export function SplitLabelNotice() {
  return (
    <Alert className={NOTICE_CLASS}>
      <PackageIcon weight="fill" aria-hidden="true" />
      <AlertTitle>Envie com o seu próprio frete</AlertTitle>
      <AlertDescription className="text-current">
        O comprador levou produtos de outro fornecedor no mesmo pedido ou no mesmo carrinho do
        Mercado Livre. A etiqueta do Mercado Livre vale para um pacote só, então envie a sua parte
        com o seu frete e informe o rastreio.
      </AlertDescription>
    </Alert>
  );
}
