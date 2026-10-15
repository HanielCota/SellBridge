import { describe, expect, it } from "vitest";
import { canManageAccount, isPlatformOwner, isProtectedAccount } from "./platform-owner.ts";

const OWNER_EMAILS = ["dona@sellbridge.test"];

const owner = { email: "dona@sellbridge.test", emailVerified: true, role: "admin" };
const admin = { email: "admin@sellbridge.test", emailVerified: true, role: "admin" };
const agent = { email: "atendente@sellbridge.test", emailVerified: true, role: "agent" };
const reseller = { email: "loja@sellbridge.test", emailVerified: true, role: "user" };

describe("isPlatformOwner", () => {
  it("is an ADMIN_EMAILS address, verified, with the admin role", () => {
    expect(isPlatformOwner(owner, OWNER_EMAILS)).toBe(true);
  });

  it("matches the address whatever its case", () => {
    expect(isPlatformOwner({ ...owner, email: "Dona@SellBridge.test" }, OWNER_EMAILS)).toBe(true);
  });

  it("is not an address nobody proved, a demoted account or an address off the list", () => {
    expect(isPlatformOwner({ ...owner, emailVerified: false }, OWNER_EMAILS)).toBe(false);
    expect(isPlatformOwner({ ...owner, role: "user" }, OWNER_EMAILS)).toBe(false);
    expect(isPlatformOwner(admin, OWNER_EMAILS)).toBe(false);
    expect(isPlatformOwner(owner, [])).toBe(false);
  });
});

describe("isProtectedAccount", () => {
  it("protects every team role and any ADMIN_EMAILS address, even one not verified yet", () => {
    expect(isProtectedAccount(owner, OWNER_EMAILS)).toBe(true);
    expect(isProtectedAccount(admin, OWNER_EMAILS)).toBe(true);
    expect(isProtectedAccount(agent, OWNER_EMAILS)).toBe(true);
    expect(isProtectedAccount({ ...reseller, email: owner.email }, OWNER_EMAILS)).toBe(true);
  });

  it("reads a list of roles the way Better Auth grants them", () => {
    expect(isProtectedAccount({ ...reseller, role: "user,admin" }, OWNER_EMAILS)).toBe(true);
    expect(isProtectedAccount({ ...reseller, role: "user, agent" }, OWNER_EMAILS)).toBe(true);
    expect(isPlatformOwner({ ...owner, role: "user,admin" }, OWNER_EMAILS)).toBe(true);
  });

  it("leaves resellers to any admin", () => {
    expect(isProtectedAccount(reseller, OWNER_EMAILS)).toBe(false);
    expect(isProtectedAccount({ ...reseller, role: null }, OWNER_EMAILS)).toBe(false);
  });
});

describe("canManageAccount", () => {
  it("lets an ordinary admin manage resellers only", () => {
    expect(canManageAccount(admin, reseller, OWNER_EMAILS)).toBe(true);
    expect(canManageAccount(admin, owner, OWNER_EMAILS)).toBe(false);
    expect(canManageAccount(admin, agent, OWNER_EMAILS)).toBe(false);
    expect(
      canManageAccount(admin, { ...admin, email: "outro@sellbridge.test" }, OWNER_EMAILS),
    ).toBe(false);
  });

  it("lets an owner manage the team, the other owners and resellers", () => {
    const otherOwner = { ...owner, email: "socio@sellbridge.test" };
    const owners = [...OWNER_EMAILS, otherOwner.email];
    expect(canManageAccount(owner, otherOwner, owners)).toBe(true);
    expect(canManageAccount(owner, admin, owners)).toBe(true);
    expect(canManageAccount(owner, agent, owners)).toBe(true);
    expect(canManageAccount(owner, reseller, owners)).toBe(true);
  });

  it("gives no owner powers to an ADMIN_EMAILS address nobody proved", () => {
    expect(canManageAccount({ ...owner, emailVerified: false }, agent, OWNER_EMAILS)).toBe(false);
  });
});
