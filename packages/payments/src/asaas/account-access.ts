import {
  markSupplierPaymentAccountError,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import {
  createAsaasAccountClient,
  createAsaasPlatformClient,
  type AsaasAccountClient,
} from "./client.ts";
import type { AsaasContext } from "./context.ts";
import { isAsaasError, type AsaasHttpOptions } from "./http.ts";

export class AsaasAccountUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsaasAccountUnavailableError";
  }
}

function httpOptions(context: AsaasContext): AsaasHttpOptions {
  return {
    baseUrl: context.settings.apiUrl,
    fetchImplementation: context.fetchImplementation ?? fetch,
  };
}

export function platformClient(context: AsaasContext) {
  return createAsaasPlatformClient(httpOptions(context), context.settings.apiKey);
}

/**
 * A client with the supplier account's own key.
 *
 * @throws {AsaasAccountUnavailableError} When the account has no usable key.
 */
export function supplierAccountClient(
  context: AsaasContext,
  account: SupplierPaymentAccount,
): AsaasAccountClient {
  if (
    account.provider !== "asaas" ||
    account.status !== "connected" ||
    account.accessTokenEnc === null
  ) {
    throw new AsaasAccountUnavailableError(`Asaas account ${account.id} is not usable`);
  }
  return createAsaasAccountClient(
    httpOptions(context),
    context.cipher.decrypt(account.accessTokenEnc),
  );
}

/**
 * Runs a call made with the supplier account's key. A refused key marks the account in error, so
 * the supplier and the team see it instead of every charge failing.
 *
 * @throws {AsaasAccountUnavailableError} When Asaas refuses the key.
 */
export async function withAsaasAccount<Result>(
  context: AsaasContext,
  account: SupplierPaymentAccount,
  call: (client: AsaasAccountClient) => Promise<Result>,
): Promise<Result> {
  const client = supplierAccountClient(context, account);
  try {
    return await call(client);
  } catch (error) {
    if (isAsaasError(error) && error.refusedCredentials) {
      await markSupplierPaymentAccountError(context.database, {
        accountId: account.id,
        lastError: "key_refused",
        refreshTokenEnc: null,
      });
      throw new AsaasAccountUnavailableError(`Asaas refused the key of account ${account.id}`);
    }
    throw error;
  }
}
