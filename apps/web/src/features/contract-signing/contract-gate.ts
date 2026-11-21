import { type ContractStanding, signingBlocksPanel } from "@sellbridge/shared/contract-signing";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";

/** The tab profile's contract standing, as the session carries it to the browser. */
export interface SessionContract {
  standing: ContractStanding["kind"];
  /** ISO end of the 30 days, for `grace` and `overdue`; null otherwise. */
  deadline: string | null;
  /** Whether only the signing screen opens (`signingBlocksPanel`). */
  blocksPanel: boolean;
}

export const CONTRACT_NOT_REQUIRED: SessionContract = {
  standing: "not_required",
  deadline: null,
  blocksPanel: false,
};

export function toSessionContract(standing: ContractStanding, kind: ProfileKind): SessionContract {
  const deadline =
    standing.kind === "grace" || standing.kind === "overdue"
      ? standing.deadline.toISOString()
      : null;
  return { standing: standing.kind, deadline, blocksPanel: signingBlocksPanel(standing, kind) };
}

/**
 * Whether the app sends the person to the signing screen. An admin visiting a customer is never
 * sent: signing is the customer's own act.
 */
export function needsContractSigning(session: {
  contract: SessionContract;
  impersonatedBy: string | null;
}): boolean {
  return session.contract.blocksPanel && session.impersonatedBy === null;
}

/** Whether the strip with the deadline shows above the pages. */
export function showsSigningReminder(session: {
  contract: SessionContract;
  impersonatedBy: string | null;
}): boolean {
  if (session.impersonatedBy !== null || session.contract.blocksPanel) {
    return false;
  }
  return session.contract.standing === "grace" || session.contract.standing === "overdue";
}

/** Whether the signing screen opens: something to sign, and the customer, not a team visit. */
export function sessionMaySign(session: {
  contract: SessionContract;
  impersonatedBy: string | null;
}): boolean {
  if (session.impersonatedBy !== null) {
    return false;
  }
  const standing = session.contract.standing;
  return standing === "grace" || standing === "overdue" || standing === "must_sign";
}
