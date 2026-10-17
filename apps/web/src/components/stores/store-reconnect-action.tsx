import { PlugIcon } from "@phosphor-icons/react";
import { STORES_LOCKED_REASON, useStoresLocked } from "@/components/stores/stores-lock";
import { Button } from "@/components/ui/button";
import { useTabProfileLink } from "@/lib/tab-profile";

/**
 * Figures a disconnected store can't vouch for give way to the one action that fixes it. The
 * OAuth start is opened by the browser itself, so its URL names the tab's profile.
 */
export function ReconnectAction({
  marketplace,
  storeName,
}: {
  marketplace: string;
  storeName: string;
}) {
  const locked = useStoresLocked();
  const withProfile = useTabProfileLink();
  return (
    <div className="col-span-2 row-start-2 pl-20 md:col-span-3 md:col-start-2 md:row-start-1 md:justify-self-end md:pl-0">
      {locked ? (
        <Button variant="outline" size="sm" disabled title={STORES_LOCKED_REASON}>
          <PlugIcon weight="bold" aria-hidden="true" />
          Reconectar
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <a
            href={withProfile(`/api/oauth/${marketplace}/start`)}
            aria-label={`Reconectar ${storeName}`}
          >
            <PlugIcon weight="bold" aria-hidden="true" />
            Reconectar
          </a>
        </Button>
      )}
    </div>
  );
}
