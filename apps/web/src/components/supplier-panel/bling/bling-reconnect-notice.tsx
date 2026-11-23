import {
  BLING_RECONNECT_REASON,
  blingConnectHref,
} from "@/features/supplier-panel/bling/bling-connection";
import { useOwnBlingToReconnect } from "@/features/supplier-panel/bling/use-bling";

/**
 * The header's ask to reconnect the supplier's Bling, drawn like the new version notice: one
 * button that opens the Bling authorization. It leaves on its own once the new authorization
 * clears the flag.
 */
export function BlingReconnectNotice({ enabled }: { enabled: boolean }) {
  const toReconnect = useOwnBlingToReconnect(enabled);
  const supplierId = toReconnect.data?.supplierId;
  if (supplierId === undefined) {
    return null;
  }
  return (
    <a
      href={blingConnectHref(supplierId)}
      // The phone hides the first words; the name keeps the whole text the computer shows.
      aria-label="Seu Bling precisa ser reconectado · Reconectar o Bling"
      title={BLING_RECONNECT_REASON}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-amber-400 bg-amber-100 px-3.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900/70"
    >
      <span
        aria-hidden="true"
        className="size-2 rounded-full bg-amber-400 shadow-[0_0_0_4px] shadow-amber-400/20"
      />
      {/* The space keeps "·" and the action apart in the text axe compares with the name. */}
      <span className="hidden sm:inline">Seu Bling precisa ser reconectado ·</span>{" "}
      <span className="font-semibold text-amber-950 dark:text-white">Reconectar o Bling</span>
    </a>
  );
}
