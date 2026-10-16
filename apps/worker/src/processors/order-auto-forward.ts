import type { Database } from "@sellbridge/database";
import {
  autoForwardCandidate,
  type AutoForwardCandidate,
  forwardOrder,
  forwardRecipients,
  noteSupplierEmailFailed,
} from "@sellbridge/database/repositories";
import type { StoreCredentials } from "@sellbridge/marketplaces";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { SendEmail } from "@sellbridge/shared/mailer";
import { autoForwardJobSchema } from "@sellbridge/shared/queues";
import type { DeliveryAddress } from "@sellbridge/shared/schemas";
import { emailSupplierLinks } from "@sellbridge/shared/supplier-order-email";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import type { JobContext } from "../lib/job-context.ts";
import { resolveStoreCredentials } from "../lib/store-access.ts";

export interface AutoForwardDependencies {
  database: Database;
  cipher: TokenCipher;
  /** The sale's delivery address from the marketplace; null when it gives none usable. */
  readAddress: (
    store: StoreCredentials,
    externalOrderId: string,
  ) => Promise<DeliveryAddress | null>;
  sendEmail: SendEmail;
  /** Origin the supplier links point to. */
  appUrl: string;
  /** AUTO_FORWARD_ENABLED: off, a job ends without touching the order. */
  enabled: boolean;
}

export type AutoForwardOutcome =
  "forwarded" | "disabled" | "not_eligible" | "no_address" | "gave_up";

/** Mercado Livre is the only marketplace the address is read from; others stay with the reseller. */
function marketplaceCredentials(
  dependencies: AutoForwardDependencies,
  candidate: AutoForwardCandidate,
): StoreCredentials | null {
  const { store } = candidate;
  if (store.marketplace !== "mercado_livre" || store.status !== "connected") {
    return null;
  }
  return resolveStoreCredentials(dependencies.cipher, store);
}

/**
 * The address, or null to leave the order with the reseller. A marketplace that has not created
 * the parcel yet answers with an error: thrown for BullMQ to try again later, until the last
 * attempt, which gives up instead (the reseller still forwards by hand).
 */
async function readAddressOrGiveUp(
  dependencies: AutoForwardDependencies,
  context: { job: JobContext; credentials: StoreCredentials; candidate: AutoForwardCandidate },
): Promise<DeliveryAddress | "gave_up" | null> {
  try {
    return await dependencies.readAddress(context.credentials, context.candidate.externalOrderId);
  } catch (error) {
    if (context.job.attemptsMade + 1 < context.job.maxAttempts) {
      throw error;
    }
    logger.warn("order.auto_forward_gave_up", { orderId: context.candidate.orderId, error });
    return "gave_up";
  }
}

/** The forward itself; another forward that won the race ends as "not eligible", not a failure. */
async function forwardOnBehalf(
  dependencies: AutoForwardDependencies,
  candidate: AutoForwardCandidate,
  address: DeliveryAddress,
) {
  try {
    return await forwardOrder(dependencies.database, candidate.tenantId, {
      orderId: candidate.orderId,
      address,
      notes: "",
      actor: "sellbridge",
    });
  } catch (error) {
    if (isAppError(error) && error.code === "CONFLICT") {
      return null;
    }
    throw error;
  }
}

/**
 * Tells each supplier by e-mail. A failed e-mail keeps the forward (the parcel exists and the
 * reseller can share a new link) and says so in the parcel's history. The log carries ids only:
 * no address, e-mail or link.
 */
async function notifySuppliers(
  dependencies: AutoForwardDependencies,
  candidate: AutoForwardCandidate,
  links: readonly { shipmentId: string; token: string }[],
): Promise<void> {
  const recipients = await forwardRecipients(
    dependencies.database,
    candidate.tenantId,
    links.map((link) => link.shipmentId),
  );
  await emailSupplierLinks({
    recipients,
    links,
    appUrl: dependencies.appUrl,
    send: dependencies.sendEmail,
    onFailure: async (shipmentId, error) => {
      await noteSupplierEmailFailed(dependencies.database, candidate.tenantId, shipmentId);
      logger.warn("order.auto_forward_email_failed", {
        orderId: candidate.orderId,
        shipmentId,
        error,
      });
    },
  });
}

/**
 * Forwards a paid order to its suppliers on its own, to the address the marketplace has for the
 * sale, and e-mails each supplier its link (item 21.b). Anything that is not clear-cut (an item
 * without a supplier, a supplier without e-mail, no address) leaves the order to the reseller.
 */
export function createAutoForwardProcessor(dependencies: AutoForwardDependencies) {
  return async function processAutoForward(job: JobContext): Promise<AutoForwardOutcome> {
    if (!dependencies.enabled) {
      return "disabled";
    }
    const { orderId } = autoForwardJobSchema.parse(job.data);
    const candidate = await autoForwardCandidate(dependencies.database, orderId);
    if (candidate === null || candidate.blocker !== null) {
      logger.info("order.auto_forward_skipped", { orderId, blocker: candidate?.blocker ?? null });
      return "not_eligible";
    }
    const credentials = marketplaceCredentials(dependencies, candidate);
    if (credentials === null) {
      logger.info("order.auto_forward_no_address", { orderId, reason: "store" });
      return "no_address";
    }
    const address = await readAddressOrGiveUp(dependencies, { job, credentials, candidate });
    if (address === "gave_up") {
      return "gave_up";
    }
    if (address === null) {
      logger.info("order.auto_forward_no_address", { orderId, reason: "marketplace" });
      return "no_address";
    }
    const links = await forwardOnBehalf(dependencies, candidate, address);
    if (links === null) {
      return "not_eligible";
    }
    await notifySuppliers(dependencies, candidate, links);
    logger.info("order.auto_forwarded", {
      orderId,
      tenantId: candidate.tenantId,
      shipments: links.length,
    });
    return "forwarded";
  };
}
