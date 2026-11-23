import {
  findOnboardingProfile,
  findSupplierOfProfile,
  findSupplierPaymentAccount,
  getSupplierSetupState,
  isOnBehalfInvoiceOff,
} from "@sellbridge/database/repositories";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { database } from "@/lib/server/database";
import { findOwnBlingToReconnect } from "@/features/supplier-panel/bling/bling-import.server";
import { asaasContext } from "@/features/supplier-payments/asaas.server";
import {
  nextResellerSetupNotice,
  nextSupplierSetupNotice,
  receivingAccountState,
  type SetupNotice,
  type SupplierSetupFacts,
} from "./account-setup-notice";

interface SetupContext {
  tenantId: string;
  profileKind: ProfileKind;
  impersonatedBy: string | null;
}

/** Asaas off on the server: no supplier can open an account, so none is asked to. */
async function receivingAccountOf(supplierId: string) {
  if (asaasContext() === null) {
    return null;
  }
  const account = await findSupplierPaymentAccount(database, { supplierId, provider: "asaas" });
  return receivingAccountState(account);
}

async function loadSupplierFacts(context: SetupContext): Promise<SupplierSetupFacts | null> {
  const supplier = await findSupplierOfProfile(database, context.tenantId);
  // Before the brand exists every panel page leads to "Cadastre sua marca": nothing to add.
  if (supplier === null) {
    return null;
  }
  const [receivingAccount, setup, onBehalfInvoiceOff, toReconnect] = await Promise.all([
    receivingAccountOf(supplier.id),
    getSupplierSetupState(database, supplier.id),
    isOnBehalfInvoiceOff(database, supplier.id),
    findOwnBlingToReconnect(context),
  ]);
  return {
    receivingAccount,
    blingToReconnect: toReconnect?.supplierId ?? null,
    products: setup.products,
    submittedProducts: setup.submitted,
    onBehalfInvoiceOff,
  };
}

/** The one setup item the header asks the tab's profile to finish, or null. */
export async function loadAccountSetupNotice(context: SetupContext): Promise<SetupNotice | null> {
  if (context.profileKind === "supplier") {
    const facts = await loadSupplierFacts(context);
    return facts === null ? null : nextSupplierSetupNotice(facts);
  }
  const profile = await findOnboardingProfile(database, context.tenantId);
  return nextResellerSetupNotice({ holder: profile.holder });
}
