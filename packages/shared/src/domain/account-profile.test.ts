import { describe, expect, it } from "vitest";
import {
  describeAccount,
  PROFILE_KINDS,
  PROFILE_STATUSES,
  primaryActionFor,
  profileKindTone,
  profileStatusTone,
  type AccountState,
  type ProfileMembership,
} from "./account-profile.ts";

const healthyReseller: AccountState = { role: "user", emailVerified: true, banned: false };

const sellerProfile: ProfileMembership = {
  id: "org-1",
  slug: "loja-da-ana-a1b2c3",
  name: "Loja da Ana",
  kind: "seller",
  memberRole: "owner",
  status: "active",
};

const supplierProfile: ProfileMembership = {
  id: "org-2",
  slug: "ana-distribuidora-d4e5f6",
  name: "Ana Distribuidora",
  kind: "supplier",
  memberRole: "owner",
  status: "in_review",
};

describe("describeAccount", () => {
  it("describes a reseller with one seller profile as titular", () => {
    const account = describeAccount(healthyReseller, [sellerProfile]);

    expect(account.staffRole).toBeNull();
    expect(account.profiles).toEqual([
      {
        ...sellerProfile,
        kindLabel: "Vendedor",
        memberRoleLabel: "Titular",
        statusLabel: "Ativo",
        isTitular: true,
      },
    ]);
  });

  it("never gives a staff account a seller or supplier profile", () => {
    // Every sign-up gets an organization, the team's included: it must not read as a profile.
    const admin = describeAccount({ ...healthyReseller, role: "user,admin" }, [
      sellerProfile,
      supplierProfile,
    ]);
    const agent = describeAccount({ ...healthyReseller, role: "agent" }, [sellerProfile]);

    expect(admin.staffRole).toBe("admin");
    expect(admin.profiles).toEqual([]);
    expect(agent.staffRole).toBe("agent");
    expect(agent.profiles).toEqual([]);
  });
});

describe("primaryActionFor", () => {
  it("picks resend verification as the primary action while the e-mail is unverified", () => {
    expect(primaryActionFor({ ...healthyReseller, emailVerified: false })).toBe(
      "resend_verification",
    );
  });

  it("picks reviewing the block before anything else for a banned account", () => {
    expect(primaryActionFor({ ...healthyReseller, emailVerified: false, banned: true })).toBe(
      "review_block",
    );
  });

  it("has no primary action for a healthy account", () => {
    expect(primaryActionFor(healthyReseller)).toBeNull();
    expect(primaryActionFor({ ...healthyReseller, banned: null })).toBeNull();
  });
});

describe("profile tones", () => {
  it("gives profile kinds a neutral tone and only statuses a color", () => {
    for (const kind of PROFILE_KINDS) {
      expect(profileKindTone(kind)).toBe("neutral");
    }
    const statusTones = PROFILE_STATUSES.map((status) => profileStatusTone(status));
    expect(statusTones).toEqual(["success", "warning", "neutral", "danger"]);
  });
});
