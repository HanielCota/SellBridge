import {
  HEADER_NOTICE_CLASS_NAME,
  HeaderNoticeContent,
  headerNoticeLabel,
} from "@/components/layout/header-notice";
import {
  BLING_RECONNECT_REASON,
  blingConnectHref,
} from "@/features/supplier-panel/bling/bling-connection";
import { useOwnBlingToReconnect } from "@/features/supplier-panel/bling/use-bling";

const MESSAGE = "Seu Bling precisa ser reconectado";
const ACTION = "Reconectar o Bling";

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
      aria-label={headerNoticeLabel(MESSAGE, ACTION)}
      title={BLING_RECONNECT_REASON}
      className={HEADER_NOTICE_CLASS_NAME}
    >
      <HeaderNoticeContent message={MESSAGE} action={ACTION} />
    </a>
  );
}
