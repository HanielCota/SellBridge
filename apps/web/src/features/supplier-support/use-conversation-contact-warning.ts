import { CONVERSATION_CONTACT_REFUSED } from "@sellbridge/shared/schemas";
import { useState } from "react";
import { contactWarning } from "@/features/fulfillment/contact-warning";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/** Long enough that an order number half typed is not taken for a phone. */
const TYPING_PAUSE_MILLISECONDS = 800;

/**
 * The contact warning of a reseller–supplier conversation box: it shows once typing pauses, and
 * at once after a send attempt. The text still goes to the server, which refuses it and records
 * the attempt for the team. `isEnabled` false keeps it quiet (support tickets to the team).
 */
export function useConversationContactWarning(text: string, isEnabled = true) {
  const [wasSendTried, setWasSendTried] = useState(false);
  const settledText = useDebouncedValue(text, TYPING_PAUSE_MILLISECONDS);
  const checkedText = wasSendTried ? text : settledText;
  const warning = isEnabled ? contactWarning(checkedText, CONVERSATION_CONTACT_REFUSED) : null;

  return {
    warning,
    noteSendAttempt: () => setWasSendTried(true),
    /** The server's refusal says what the warning already says: show it once. */
    unlessWarned: (error: string | null) => (error === warning ? null : error),
  };
}
