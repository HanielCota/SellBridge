import { WalletIcon } from "@phosphor-icons/react";
import {
  SUPPLIER_HOLD_LABELS,
  SUPPLIER_HOLD_MESSAGES,
  type PreparationHold,
} from "@sellbridge/shared/receiving-rules";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Why the supplier cannot prepare the parcel yet, with what to do. In the panel, a parcel
 * waiting for the receiving account links to Recebimentos; the order link page has no panel.
 */
export function PreparationHoldAlert({
  hold,
  showAccountLink,
}: {
  hold: PreparationHold;
  showAccountLink: boolean;
}) {
  return (
    <Alert
      role="note"
      className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100"
    >
      <WalletIcon aria-hidden="true" />
      <AlertTitle>{SUPPLIER_HOLD_LABELS[hold]}</AlertTitle>
      <AlertDescription className="space-y-3 text-amber-900 dark:text-amber-200">
        <p>{SUPPLIER_HOLD_MESSAGES[hold]}</p>
        {hold === "receiving_account" && showAccountLink ? (
          <Button asChild className="bg-amber-400 text-amber-950 hover:bg-amber-300">
            <Link to="/fornecedor/painel/recebimentos">Ligar minha conta</Link>
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
