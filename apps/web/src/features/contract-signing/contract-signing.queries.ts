import { queryOptions } from "@tanstack/react-query";
import { getContractSigningSettingsFn } from "./contract-signing.functions";

export const contractSigningSettingsQueryOptions = () =>
  queryOptions({
    queryKey: ["contract-signing-settings"],
    queryFn: () => getContractSigningSettingsFn(),
  });
