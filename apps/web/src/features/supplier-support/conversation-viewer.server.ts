import { findSupplierOfProfile, type ConversationViewer } from "@sellbridge/database/repositories";
import { forbiddenError } from "@sellbridge/shared/errors";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { database } from "@/lib/server/database";

interface ProfileOfSession {
  tenantId: string;
  profileKind: ProfileKind;
}

/**
 * Which side of the conversations a profile reads: a seller profile its own stores', a supplier
 * profile those sent to its brand. Null for a supplier that has not set up its brand yet.
 */
export async function findConversationViewer(
  session: ProfileOfSession,
): Promise<ConversationViewer | null> {
  if (session.profileKind === "seller") {
    return { side: "reseller", tenantId: session.tenantId };
  }
  const supplier = await findSupplierOfProfile(database, session.tenantId);
  if (supplier === null) {
    return null;
  }
  return { side: "supplier", supplierId: supplier.id };
}

/** `findConversationViewer` for calls that need a side: a supplier without a brand is refused. */
export async function conversationViewerOf(session: ProfileOfSession): Promise<ConversationViewer> {
  const viewer = await findConversationViewer(session);
  if (viewer === null) {
    throw forbiddenError("Cadastre sua marca para conversar com os revendedores.");
  }
  return viewer;
}
