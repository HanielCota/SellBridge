import { StorefrontIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useStoreOpen } from "@/features/supplier-panel/store/use-store-open";

/**
 * Shown on every panel page while the supplier keeps the store closed: what stopped, what still
 * has to be done (the orders already received) and the way back in one click.
 */
export function StoreClosedBanner({ supplierId }: { supplierId: string }) {
  const storeOpen = useStoreOpen(supplierId);
  return (
    <Alert className="rounded-3xl border-amber-300 bg-amber-50 p-5 text-amber-950 sm:p-6 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
      <StorefrontIcon aria-hidden="true" />
      <AlertTitle className="text-base font-semibold">Sua loja está fechada para vendas</AlertTitle>
      <AlertDescription className="space-y-3 text-amber-900 dark:text-amber-200">
        <p>
          Os anúncios dos revendedores ficam sem estoque nos marketplaces, então não entram pedidos
          novos. Os pedidos que você já recebeu continuam aqui: entregue normalmente.
        </p>
        <Button
          className="bg-amber-400 text-amber-950 hover:bg-amber-300"
          disabled={storeOpen.isPending}
          onClick={() => storeOpen.mutate(true)}
        >
          {storeOpen.isPending ? "Reabrindo…" : "Reabrir loja"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
