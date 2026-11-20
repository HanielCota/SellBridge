import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";
import { SupplierPageFrame } from "@/components/fulfillment/supplier-page-frame";
import { Skeleton } from "@/components/ui/skeleton";
import { pendingInvite } from "@/features/supplier-invite/pending-invite";

export const Route = createFileRoute("/fornecedor/convite/")({
  head: () => ({
    meta: [
      { title: "Convite para o painel do fornecedor | SellBridge" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReturningInvitePage,
});

/** The kept invite changes only by this page's own navigation: nothing to subscribe to. */
function ignoreChanges(): () => void {
  return () => undefined;
}

/**
 * Where the sign-in and the sign-up come back to: the invite this browser kept. Another browser
 * or device has none, so the person opens the invite e-mail again.
 */
function ReturningInvitePage() {
  // Undefined while the server renders: the browser storage is only read after hydration.
  const token = useSyncExternalStore(ignoreChanges, pendingInvite, () => undefined);
  const isMissing = token === null;
  useEffect(() => {
    if (typeof token === "string") {
      window.location.replace(`/fornecedor/convite/${token}`);
    }
  }, [token]);
  return (
    <SupplierPageFrame>
      {isMissing ? (
        <section className="surface-card space-y-2 rounded-2xl bg-card p-5" aria-labelledby="again">
          <h1 id="again" className="text-2xl font-semibold tracking-tight">
            Abra o convite de novo
          </h1>
          <p className="text-sm text-muted-foreground">
            Este navegador não guardou o seu convite. Abra o e-mail do convite, ou o último pedido
            que você recebeu, e toque no botão de novo.
          </p>
        </section>
      ) : (
        <output className="block surface-card rounded-2xl bg-card p-5" aria-busy="true">
          <Skeleton className="h-7 w-64" />
        </output>
      )}
    </SupplierPageFrame>
  );
}
