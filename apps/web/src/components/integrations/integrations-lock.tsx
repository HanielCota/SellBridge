import { createContext, useContext } from "react";

/**
 * True while an admin uses the app as the customer ("Entrar como cliente"): keys and webhooks
 * outlive that visit, so the server refuses changing them and the controls show it.
 */
export const IntegrationsLockContext = createContext(false);

export function useIntegrationsLocked(): boolean {
  return useContext(IntegrationsLockContext);
}

export const INTEGRATIONS_LOCKED_REASON = "Indisponível durante o acesso como cliente";
