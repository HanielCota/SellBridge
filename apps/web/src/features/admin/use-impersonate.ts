import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { rememberReturnPath } from "./impersonation-return";

/**
 * Opens the app as a customer, straight on the page where the problem is (a supplier's panel for
 * a supplier); everything done there is done on their account. The document reloads so the
 * session swap is complete, and "Voltar" brings the team back to the page it left.
 */
export function useImpersonate() {
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  async function impersonate(userId: string, path = "/dashboard"): Promise<void> {
    setPendingUserId(userId);
    rememberReturnPath(`${window.location.pathname}${window.location.search}`);
    const result = await authClient.admin.impersonateUser({ userId });
    if (result.error) {
      setPendingUserId(null);
      toast.error(result.error.message ?? "Não foi possível entrar como este cliente.");
      return;
    }
    window.location.assign(path);
  }

  return { impersonate, pendingUserId };
}
