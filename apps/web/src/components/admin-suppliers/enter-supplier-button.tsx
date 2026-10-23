import type { AdminSupplier } from "@sellbridge/database/repositories";
import { SignInIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { findSupplierAccountFn } from "@/features/admin-suppliers/supplier-account.functions";
import { useImpersonate } from "@/features/admin/use-impersonate";
import { errorMessage } from "@/lib/errors";

/**
 * "Entrar como fornecedor" on the admin's supplier list, for a supplier with its own account:
 * opens its panel as the supplier, to fix a catalog or an order with them.
 */
export function EnterSupplierButton({ supplier }: { supplier: AdminSupplier }) {
  const { impersonate, pendingUserId } = useImpersonate();
  const [isFinding, setIsFinding] = useState(false);
  if (supplier.organizationId === null) {
    return null;
  }

  async function enter() {
    setIsFinding(true);
    try {
      const { userId } = await findSupplierAccountFn({ data: { supplierId: supplier.id } });
      if (userId === null) {
        toast.error("Este fornecedor ainda não tem uma pessoa com acesso ao painel.");
        return;
      }
      await impersonate(userId, "/fornecedor/painel");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsFinding(false);
    }
  }

  return (
    <Hint label="Entrar como fornecedor para fazer o ajuste no painel dele" openOnTap={false}>
      {/* Quiet on purpose: it repeats on every row with an account, next to the supplier's name.
          The negative margin lines the glyph up with the column header and the card edge; the
          after layer keeps a 44px target around the 32px button. */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="relative -mx-2 text-muted-foreground after:absolute after:-inset-1.5 hover:text-foreground"
        aria-label={`Entrar como fornecedor: ${supplier.name}`}
        disabled={isFinding || pendingUserId !== null}
        onClick={() => void enter()}
      >
        <SignInIcon aria-hidden="true" />
      </Button>
    </Hint>
  );
}
