import { useOutdatedPage } from "@/features/app-version/use-outdated-page";
import { HEADER_NOTICE_CLASS_NAME, HeaderNoticeContent, headerNoticeLabel } from "./header-notice";

const MESSAGE = "Nova versão do SellBridge";
const ACTION = "Atualizar";

/**
 * A quiet button in the header once a deploy replaced this page's build. Reloading is the
 * person's choice: an automatic reload could throw away a form being filled in.
 */
export function NewVersionNotice() {
  const outdated = useOutdatedPage();
  if (!outdated) {
    return null;
  }
  return (
    <button
      type="button"
      aria-label={headerNoticeLabel(MESSAGE, ACTION)}
      onClick={() => window.location.reload()}
      className={HEADER_NOTICE_CLASS_NAME}
    >
      <HeaderNoticeContent message={MESSAGE} action={ACTION} />
    </button>
  );
}
