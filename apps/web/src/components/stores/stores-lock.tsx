import { createContext, useContext } from "react";

/**
 * True while an admin uses the app as the customer ("Entrar como cliente"): connecting or
 * disconnecting a store outlives that visit, so the server refuses it and the controls show it.
 */
export const StoresLockContext = createContext(false);

export function useStoresLocked(): boolean {
  return useContext(StoresLockContext);
}

export const STORES_LOCKED_REASON = "Indisponível durante o acesso como cliente";
