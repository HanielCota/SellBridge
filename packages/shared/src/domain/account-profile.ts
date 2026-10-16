import { staffRoleOf, type StaffRole } from "./staff-access.ts";

/**
 * One account (the login) may hold several profiles: a seller one and, later, a supplier one.
 * The SellBridge team is an account of its own and never holds a profile. Glossary: Conta =
 * login, Perfil = Vendedor or Fornecedor, Cargo = role, Titular = who answers for the profile.
 */
export const PROFILE_KINDS = ["seller", "supplier"] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export const PROFILE_STATUSES = ["active", "in_review", "paused", "suspended"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

/** How the screen paints a kind or a status; only statuses carry a color. */
export type ProfileTone = "neutral" | "success" | "warning" | "danger";

export const PROFILE_KIND_LABELS: Record<ProfileKind, string> = {
  seller: "Vendedor",
  supplier: "Fornecedor",
};

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = {
  active: "Ativo",
  in_review: "Em análise",
  paused: "Pausado",
  suspended: "Suspenso",
};

const PROFILE_KIND_TONES: Record<ProfileKind, ProfileTone> = {
  seller: "neutral",
  supplier: "neutral",
};

const PROFILE_STATUS_TONES: Record<ProfileStatus, ProfileTone> = {
  active: "success",
  in_review: "warning",
  paused: "neutral",
  suspended: "danger",
};

/** Better Auth organization member roles; anything else reads as an ordinary member. */
const MEMBER_ROLE_LABELS: Record<string, string> = {
  owner: "Titular",
  admin: "Administrador",
  member: "Membro",
};

const TITULAR_ROLE = "owner";

/** What the rules read from the account (Better Auth's `user` row). */
export interface AccountState {
  role: string | null | undefined;
  emailVerified: boolean;
  banned: boolean | null | undefined;
}

/** One profile the account belongs to, as the membership query returns it. */
export interface ProfileMembership {
  id: string;
  slug: string;
  name: string;
  kind: ProfileKind;
  /** The Better Auth `member.role` inside that profile. */
  memberRole: string;
  status: ProfileStatus;
}

export interface ProfileDescription extends ProfileMembership {
  kindLabel: string;
  memberRoleLabel: string;
  statusLabel: string;
  isTitular: boolean;
}

export interface AccountDescription {
  staffRole: StaffRole | null;
  profiles: readonly ProfileDescription[];
}

/** The one action the team should see first for this account, or null when nothing is wrong. */
export type AccountPrimaryAction = "review_block" | "resend_verification";

/** Better Auth stores several roles as "user,admin"; the first team role found wins. */
function staffRoleIn(role: string | null | undefined): StaffRole | null {
  if (role === null || role === undefined) {
    return null;
  }
  const staffRoles = role
    .split(",")
    .map((part) => staffRoleOf(part.trim()))
    .filter((staffRole) => staffRole !== null);
  return staffRoles[0] ?? null;
}

function memberRoleLabelOf(memberRole: string): string {
  return MEMBER_ROLE_LABELS[memberRole] ?? "Membro";
}

function describeProfile(membership: ProfileMembership): ProfileDescription {
  return {
    ...membership,
    kindLabel: PROFILE_KIND_LABELS[membership.kind],
    memberRoleLabel: memberRoleLabelOf(membership.memberRole),
    statusLabel: PROFILE_STATUS_LABELS[membership.status],
    isTitular: membership.memberRole === TITULAR_ROLE,
  };
}

/**
 * The single description of an account that the header, the admin pages and support read.
 * Team accounts get no profile even though sign-up gave them an organization.
 */
export function describeAccount(
  account: AccountState,
  memberships: readonly ProfileMembership[],
): AccountDescription {
  const staffRole = staffRoleIn(account.role);
  if (staffRole !== null) {
    return { staffRole, profiles: [] };
  }
  return { staffRole: null, profiles: memberships.map(describeProfile) };
}

/** A block comes first: resending a verification to a banned account would solve nothing. */
export function primaryActionFor(account: AccountState): AccountPrimaryAction | null {
  if (account.banned === true) {
    return "review_block";
  }
  if (!account.emailVerified) {
    return "resend_verification";
  }
  return null;
}

/** The kind is who the profile is, not a state, so it never takes a color. */
export function profileKindTone(kind: ProfileKind): ProfileTone {
  return PROFILE_KIND_TONES[kind];
}

export function profileStatusTone(status: ProfileStatus): ProfileTone {
  return PROFILE_STATUS_TONES[status];
}
