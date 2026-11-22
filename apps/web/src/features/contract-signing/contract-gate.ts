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

interface GateSession {
  /**
   * Optional on purpose: while a deploy rolls out, a page of the new version can get the session
   * from a server of the previous one, which does not send the field yet.
   */
  contract?: SessionContract | undefined;
  impersonatedBy: string | null;
}

/** The session's contract, or "not required" when the answering server predates the field. */
export function sessionContractOf(session: GateSession): SessionContract {
  return session.contract ?? CONTRACT_NOT_REQUIRED;
}

/** Pages that never wait on a contract: the team tools, and support, where a stuck person asks for help. */
const GATE_FREE_PATHS = ["/admin", "/suporte"] as const;

export function isContractGateFreePath(pathname: string): boolean {
  return GATE_FREE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Whether the app sends the person to the signing screen. An admin visiting a customer is never
 * sent (signing is the customer's own act), and the gate-free pages never wait on a
 * profile's contract (`isContractGateFreePath`).
 */
export function needsContractSigning(session: GateSession, onGateFreePage: boolean): boolean {
  if (onGateFreePage) {
    return false;
  }
  return sessionContractOf(session).blocksPanel && session.impersonatedBy === null;
}

/** Whether the strip with the deadline shows above the pages (never on the team pages). */
export function showsSigningReminder(session: GateSession, onTeamPage: boolean): boolean {
  const contract = sessionContractOf(session);
  if (onTeamPage || session.impersonatedBy !== null || contract.blocksPanel) {
    return false;
  }
  return contract.standing === "grace" || contract.standing === "overdue";
}

/** Whether the signing screen opens: something to sign, and the customer, not a team visit. */
export function sessionMaySign(session: GateSession): boolean {
  if (session.impersonatedBy !== null) {
    return false;
  }
  const standing = sessionContractOf(session).standing;
  return standing === "grace" || standing === "overdue" || standing === "must_sign";
}
