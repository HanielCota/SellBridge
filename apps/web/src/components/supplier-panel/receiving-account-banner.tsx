import { WalletIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Shown on every panel page while the admin requires an approved receiving account and the
 * supplier has none: what stopped and the way to fix it in one click.
 */
export function ReceivingAccountBanner() {
  return (
    // A standing state, not news: "note" keeps screen readers from announcing it on every page.
    <Alert
      role="note"
      className="rounded-3xl border-amber-300 bg-amber-50 p-5 text-amber-950 sm:p-6 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100"
    >
      <WalletIcon aria-hidden="true" />
      <AlertTitle className="text-base font-semibold">
        Seus produtos não aparecem para os revendedores
      </AlertTitle>
      <AlertDescription className="space-y-3 text-amber-900 dark:text-amber-200">
        <p>
          O revendedor paga você pelo SellBridge, numa conta sua no Asaas. Até a conta ser aprovada,
          seus produtos ficam fora do catálogo e os pedidos novos esperam.
        </p>
        <Button asChild className="bg-amber-400 text-amber-950 hover:bg-amber-300">
          <Link to="/fornecedor/painel/recebimentos">Ligar minha conta</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
