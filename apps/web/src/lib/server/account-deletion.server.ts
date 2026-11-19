import {
  accountFileKeys,
  deleteTenantData,
  findSoleOwnedTenants,
  forgetBillingCustomer,
  getBillingAccount,
  listStoreConnections,
} from "@sellbridge/database/repositories";
import { AppError, forbiddenError, isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { isPlatformOwner } from "@sellbridge/shared/platform-owner";
import { isStaffRole } from "@sellbridge/shared/staff-access";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { isAsaasError } from "@sellbridge/payments/asaas";
import { billingClientForCleanup } from "@/features/billing/billing-config.server";
import { CHARGE_REFERENCE, CHECKOUT_REFERENCE } from "@/features/billing/pending-reference";
import { avatarStorageKey } from "@/features/profile/avatar-key";
import { disconnectStoreForTenant } from "@/features/stores/disconnect-store.server";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { fileStorage } from "@/lib/server/storage";

/**
 * The account about to be deleted. Better Auth types `beforeDelete`'s user without the admin
 * plugin's `role`, which is there at run time, so the object is read through this schema.
 */
const deletingAccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: z.string().nullish(),
  image: z.string().nullish(),
});
export type DeletingAccount = z.infer<typeof deletingAccountSchema>;

const TEAM_ACCOUNT_MESSAGE =
  "Contas da equipe não são excluídas por aqui. Fale com o dono da plataforma.";

const UNREACHABLE_MESSAGE =
  "Não foi possível cancelar a assinatura agora. Tente excluir a conta de novo em alguns minutos.";

/**
 * What is open at Asaas closes too, with no refund: an unpaid upgrade difference or card
 * checkout, the subscription with its unpaid charges, and the customer. No charge may outlive
 * the account. Failing here stops the deletion before any data is touched. Payments already
 * made stay at Asaas as SellBridge's record; the customer is then forgotten here, so nothing
 * links them to the person and a retried deletion does not ask again.
 */
async function closeBilling(tenantId: string): Promise<void> {
  const account = await getBillingAccount(database, tenantId);
  const client = billingClientForCleanup();
  if (account === null || client === null) {
    return;
  }
  const { customerId, subscriptionId } = account;
  if (customerId === null) {
    return;
  }
  const reference = account.pendingReference ?? "";
  if (reference.startsWith(CHARGE_REFERENCE)) {
    await removeAtAsaas(async () => client.deleteCharge(reference.slice(CHARGE_REFERENCE.length)));
  }
  if (reference.startsWith(CHECKOUT_REFERENCE)) {
    await removeAtAsaas(async () =>
      client.cancelCheckout(reference.slice(CHECKOUT_REFERENCE.length)),
    );
  }
  if (subscriptionId !== null) {
    await removeAtAsaas(async () => client.deleteSubscription(subscriptionId));
  }
  await removeAtAsaas(async () => client.deleteSubscriber(customerId));
  await forgetBillingCustomer(database, tenantId);
}

/** Something Asaas no longer has is already the goal of the call. */
async function removeAtAsaas(remove: () => Promise<unknown>): Promise<void> {
  try {
    await remove();
  } catch (error) {
    if (isAsaasError(error) && error.status === 404) {
      return;
    }
    throw new AppError("EXTERNAL_PROVIDER", UNREACHABLE_MESSAGE, { cause: error });
  }
}

/**
 * The person waits on the dialog: past this budget, the remaining stores are disconnected
 * without pausing (each pause run has its own 20 s cap), instead of the request timing out and
 * the deletion being retried halfway.
 */
const PAUSE_BUDGET_MILLISECONDS = 30_000;

/** Connected stores are disconnected with their listings paused, as the store page does. */
async function closeStores(tenantId: string, deadline: number): Promise<void> {
  const stores = await listStoreConnections(database, tenantId);
  for (const store of stores) {
    if (store.status !== "connected") {
      continue;
    }
    await disconnectStoreForTenant({
      tenantId,
      storeConnectionId: store.id,
      pauseListings: Date.now() < deadline,
    });
  }
}

/** Files are removed after the rows; one that fails is logged, never left blocking the rest. */
async function deleteFiles(keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    try {
      await fileStorage.delete(key);
    } catch (error) {
      logger.warn("account.file_delete_failed", { error });
    }
  }
}

/**
 * Runs before Better Auth deletes the user (whose memberships, sessions and logins cascade).
 * Workspaces the user owns alone go with the account: billing first, then stores, then the
 * data. A workspace another owner still runs stays with them.
 */
export async function prepareAccountDeletion(account: DeletingAccount): Promise<void> {
  const identity = {
    email: account.email,
    emailVerified: account.emailVerified,
    role: account.role,
  };
  if (isStaffRole(account.role) || isPlatformOwner(identity, environment.ADMIN_EMAILS)) {
    throw forbiddenError(TEAM_ACCOUNT_MESSAGE);
  }
  const tenantIds = await findSoleOwnedTenants(database, account.id);
  const attachmentKeys = await accountFileKeys(database, { userId: account.id, tenantIds });
  const avatarKey = avatarStorageKey(account.image, account.id);
  for (const tenantId of tenantIds) {
    await closeBilling(tenantId);
  }
  const deadline = Date.now() + PAUSE_BUDGET_MILLISECONDS;
  for (const tenantId of tenantIds) {
    await closeStores(tenantId, deadline);
    await deleteTenantData(database, tenantId);
  }
  await deleteFiles(avatarKey === null ? attachmentKeys : [...attachmentKeys, avatarKey]);
  logger.info("account.deletion_prepared", { userId: account.id, workspaces: tenantIds.length });
}

/** `afterDelete`: the user row is gone only now. */
export function afterAccountDeletion(user: { id: string }): void {
  logger.info("account.deleted", { userId: user.id });
}

/** `beforeDelete` for Better Auth: the same steps, with refusals as HTTP errors it understands. */
export async function beforeAccountDeletion(user: unknown): Promise<void> {
  const account = deletingAccountSchema.parse(user);
  try {
    await prepareAccountDeletion(account);
  } catch (error) {
    if (isAppError(error) && error.code === "FORBIDDEN") {
      throw new APIError("FORBIDDEN", { message: error.userMessage });
    }
    if (isAppError(error)) {
      logger.error("account.delete_failed", { userId: account.id, error });
      throw new APIError("SERVICE_UNAVAILABLE", { message: error.userMessage });
    }
    throw error;
  }
}

/**
 * Deleting the account always asks for the password: Better Auth would otherwise accept a
 * recent session alone. The e-mailed token path is not offered.
 */
const DELETION_PASSWORD_MESSAGE = "Digite sua senha para excluir a conta";

const deletionRequestSchema = z.object({
  password: z.string({ error: DELETION_PASSWORD_MESSAGE }).min(1, DELETION_PASSWORD_MESSAGE),
  token: z.never({ error: "Exclusão por link não está disponível" }).optional(),
});

/** Checks the body of POST /delete-user before Better Auth handles it. */
export function assertDeletionRequest(body: unknown): void {
  const parsed = deletionRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new APIError("BAD_REQUEST", {
      message: parsed.error.issues[0]?.message ?? DELETION_PASSWORD_MESSAGE,
    });
  }
}
