import {
  claimSupplierForProfile,
  findClaimingProfile,
  getSupplierInviteTarget,
  getSupplierShipment,
} from "@sellbridge/database/repositories";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { sendEmail } from "@/lib/server/mailer";
import { supplierInviteEmail } from "./invite-email";
import { inviteStateOf, type InviteState } from "./invite-state";
import { readSupplierInvite, signSupplierInvite } from "./invite-token";

/** Where an invite opens: the token only ever travels in this path. */
export function supplierInvitePath(supplierId: string): string {
  const token = signSupplierInvite({
    supplierId,
    now: new Date(),
    secret: environment.BETTER_AUTH_SECRET,
  });
  return `/fornecedor/convite/${token}`;
}

async function signedInViewer() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (session === null) {
    return null;
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
  };
}

async function stateOf(token: string, viewer: Awaited<ReturnType<typeof signedInViewer>>) {
  const reading = readSupplierInvite({
    token,
    now: new Date(),
    secret: environment.BETTER_AUTH_SECRET,
  });
  const target =
    reading.status === "valid" ? await getSupplierInviteTarget(database, reading.supplierId) : null;
  return { reading, state: inviteStateOf({ reading, target, viewer }) };
}

/** What the invite page shows to whoever opens it, signed in or not. */
export async function describeSupplierInvite(token: string): Promise<InviteState> {
  const { state } = await stateOf(token, await signedInViewer());
  return state;
}

const REFUSALS: Record<Exclude<InviteState["status"], "ready">, string> = {
  invalid: "Convite inválido. Peça um novo à equipe SellBridge.",
  expired: "Este convite venceu. Peça um novo à equipe SellBridge.",
  claimed: "Este fornecedor já tem acesso ao painel. Entre com a conta dele.",
  no_email: "Falta o e-mail de pedidos deste fornecedor. Fale com a equipe SellBridge.",
  signed_out: "Entre com o e-mail de pedidos do fornecedor para ativar o painel.",
  wrong_email: "Este convite é para outro e-mail. Entre com o e-mail de pedidos do fornecedor.",
  unconfirmed: "Confirme o seu e-mail antes de ativar o painel.",
};

/**
 * Links the invited supplier to the signed-in person's supplier profile and returns that
 * profile's slug, for the panel address. Every condition is checked again here, never trusted
 * from the page.
 *
 * @throws {AppError} `CONFLICT` with the reason in Portuguese when the invite cannot be used.
 */
export async function acceptSupplierInvite(token: string): Promise<{ profileSlug: string }> {
  const viewer = await signedInViewer();
  const { reading, state } = await stateOf(token, viewer);
  if (state.status !== "ready" || reading.status !== "valid" || viewer === null) {
    throw conflictError(REFUSALS[state.status === "ready" ? "signed_out" : state.status]);
  }
  const profile = await findClaimingProfile(database, viewer.userId);
  if (profile.status === "no_supplier_profile") {
    throw conflictError(
      "Esta conta não tem perfil de fornecedor. Fale com o suporte para ligar o fornecedor a ela.",
    );
  }
  if (profile.status === "has_brand") {
    throw conflictError(
      "Esta conta já tem uma marca cadastrada. Fale com o suporte para juntar os cadastros.",
    );
  }
  await claimSupplierForProfile(database, {
    supplierId: reading.supplierId,
    organizationId: profile.organizationId,
  });
  logger.info("supplier_invite.claimed", {
    supplierId: reading.supplierId,
    organizationId: profile.organizationId,
  });
  return { profileSlug: profile.slug };
}

/**
 * An invite for the supplier behind an order link, so a supplier who only ever used links can
 * create its panel access from the order it is working on.
 *
 * @throws {AppError} `NOT_FOUND` when the link is invalid, expired, revoked or already in a panel.
 */
export async function inviteFromOrderLink(token: string): Promise<{ invitePath: string }> {
  const shipment = await getSupplierShipment(database, token);
  return { invitePath: supplierInvitePath(shipment.supplierId) };
}

/**
 * The team's "Enviar convite": e-mails the invite to the supplier's order e-mail and returns its
 * address, so the team can also send it by WhatsApp.
 *
 * @throws {AppError} `NOT_FOUND` for an unknown supplier, `CONFLICT` when it already has a panel
 * or has no order e-mail to invite.
 */
export async function sendSupplierInvite(supplierId: string): Promise<{ inviteUrl: string }> {
  const target = await getSupplierInviteTarget(database, supplierId);
  if (target === null) {
    throw notFoundError(`Fornecedor não encontrado (fornecedor: ${supplierId})`);
  }
  if (target.hasPanel) {
    throw conflictError("Este fornecedor já tem acesso ao painel.");
  }
  if (target.contactEmail === null || target.contactEmail.trim() === "") {
    throw conflictError("Cadastre o e-mail de pedidos do fornecedor antes de convidar.");
  }
  const inviteUrl = new URL(supplierInvitePath(supplierId), environment.APP_URL).toString();
  await sendEmail({
    to: target.contactEmail,
    ...supplierInviteEmail(
      { supplierName: target.name, contactEmail: target.contactEmail, inviteUrl },
      environment.APP_URL,
    ),
  });
  logger.info("supplier_invite.sent", { supplierId });
  return { inviteUrl };
}
