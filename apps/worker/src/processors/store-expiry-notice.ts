import { createHash } from "node:crypto";
import type { Database } from "@sellbridge/database";
import {
  claimStoreExpiryNotice,
  type ExpiredStoreRecipient,
  findExpiredStoreRecipients,
  releaseStoreExpiryNotice,
} from "@sellbridge/database/repositories";
import { MARKETPLACE_LABELS } from "@sellbridge/marketplaces";
import { renderActionEmail } from "@sellbridge/shared/email-layout";
import { logger } from "@sellbridge/shared/logger";
import type { SendEmail } from "@sellbridge/shared/mailer";

export interface StoreExpiryNoticeDependencies {
  database: Database;
  sendEmail: SendEmail;
  /** Origin of the "reconnect" link. */
  appUrl: string;
}

/**
 * Stores that expired within this window are e-mailed; older ones (before this feature, or
 * while the worker was down for long) are left to the bell.
 */
const NOTICE_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1000;

/**
 * One e-mail per owner and per lost connection: reconnecting brings new tokens, so a store
 * that expires again later is a new fact. Only a hash of the ciphertext goes in the key.
 */
function noticeKey(recipient: ExpiredStoreRecipient): string {
  const connection = createHash("sha256")
    .update(recipient.connectionTokenEnc ?? "none")
    .digest("hex")
    .slice(0, 16);
  return `store:${recipient.storeId}:expired:${connection}`;
}

function expiredStoreEmail(recipient: ExpiredStoreRecipient, appUrl: string) {
  const marketplace = MARKETPLACE_LABELS[recipient.marketplace];
  return renderActionEmail(
    {
      subject: `A loja ${recipient.shopName} perdeu o acesso ao ${marketplace}`,
      preview: "Reconecte a loja para voltar a sincronizar estoque, preço e pedidos.",
      heading: `Reconecte a loja ${recipient.shopName}`,
      paragraphs: [
        `O ${marketplace} recusou o acesso do SellBridge a esta loja. Enquanto ela não for reconectada, estoque, preço e pedidos param de sincronizar.`,
        "As vendas que chegarem nesse meio-tempo ficam guardadas e entram quando você reconectar.",
      ],
      actionLabel: "Reconectar a loja",
      actionUrl: `${appUrl}/lojas`,
      footnote: "Você recebe este aviso por ser dono da conta no SellBridge.",
    },
    appUrl,
  );
}

/** Claims, sends and, on failure, releases one notice; returns whether it went out. */
async function sendNotice(
  dependencies: StoreExpiryNoticeDependencies,
  recipient: ExpiredStoreRecipient,
): Promise<boolean> {
  const email = expiredStoreEmail(recipient, dependencies.appUrl);
  const claimId = await claimStoreExpiryNotice(dependencies.database, {
    tenantId: recipient.tenantId,
    recipientId: recipient.recipientId,
    dedupeKey: noticeKey(recipient),
    subject: email.subject,
  });
  if (claimId === null) {
    return false;
  }
  try {
    await dependencies.sendEmail({ to: recipient.email, ...email });
    return true;
  } catch (error) {
    logger.warn("store.expiry_notice_failed", { storeConnectionId: recipient.storeId, error });
    await releaseStoreExpiryNotice(dependencies.database, claimId);
    return false;
  }
}

/**
 * E-mails each owner, once per lost connection, about stores that just lost their access. The
 * bell already shows it in the app; this reaches the seller who is not looking.
 * TODO(item 25): move to the notification center's queue once its e-mail dispatcher lands.
 */
export async function notifyExpiredStores(
  dependencies: StoreExpiryNoticeDependencies,
): Promise<number> {
  const since = new Date(Date.now() - NOTICE_WINDOW_MILLISECONDS);
  const recipients = await findExpiredStoreRecipients(dependencies.database, since);
  let sent = 0;
  for (const recipient of recipients) {
    const delivered = await sendNotice(dependencies, recipient);
    sent += delivered ? 1 : 0;
  }
  if (sent > 0) {
    logger.info("store.expiry_notices_sent", { sent });
  }
  return sent;
}
