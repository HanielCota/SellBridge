import { environment } from "@/lib/server/environment";
import { createSupportAssistant } from "./support-assistant-chain";

/** The one assistant of this server, picked by `SUPPORT_ASSISTANT_PROVIDER`. */
export const supportAssistant = createSupportAssistant(environment.SUPPORT_ASSISTANT_PROVIDER);
