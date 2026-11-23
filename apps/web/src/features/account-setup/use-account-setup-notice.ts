import { useQuery } from "@tanstack/react-query";
import { ownAccountSetupNotice } from "./account-setup.functions";

/** A missing Bling permission is found by the worker within 15 minutes; the header asks this often. */
const SETUP_CHECK_IN_MS = 5 * 60 * 1000;

export const ACCOUNT_SETUP_NOTICE_KEY = ["account-setup-notice"] as const;

/**
 * The header notice's item, read again every few minutes and whenever the person comes back to
 * the tab, so a fixed item leaves on its own.
 */
export function useAccountSetupNotice(enabled: boolean) {
  return useQuery({
    queryKey: ACCOUNT_SETUP_NOTICE_KEY,
    queryFn: async () => await ownAccountSetupNotice(),
    enabled,
    staleTime: SETUP_CHECK_IN_MS,
    refetchInterval: SETUP_CHECK_IN_MS,
  });
}
