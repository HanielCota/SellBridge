import { ProhibitIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { offAccountReviewSearch } from "@/features/supplier-panel/home/team-notices-contest";

/**
 * Shown on every panel page once the team switched the supplier off, on its 3rd flag or by hand
 * from the supplier's record (so it names no cause): what stopped, what still has to be done (the
 * orders already received) and how to ask for a review.
 */
export function SupplierOffBanner() {
  return (
    <Alert variant="destructive" role="alert" className="rounded-3xl p-5 sm:p-6">
      <ProhibitIcon aria-hidden="true" />
      <AlertTitle className="text-base font-semibold">
        Sua conta de fornecedor está desligada
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          A equipe SellBridge desligou sua conta. Seus produtos saíram do catálogo e os anúncios dos
          revendedores foram pausados. Por enquanto não dá para cadastrar, enviar nem importar
          produtos.
        </p>
        <p>Os pedidos que você já recebeu continuam aqui: entregue todos normalmente.</p>
        <Link
          to="/suporte/novo"
          search={offAccountReviewSearch()}
          className="inline-block font-medium text-destructive underline underline-offset-4"
        >
          Pedir revisão ao suporte
        </Link>
      </AlertDescription>
    </Alert>
  );
}
