import { describe, expect, it, vi } from "vitest";
import {
  assertMayImpersonate,
  visitDetails,
  type ImpersonationDirectory,
} from "./impersonation-guard";

vi.mock("@sellbridge/shared/logger", () => ({
  logger: { warn: vi.fn<() => void>(), info: vi.fn<() => void>() },
}));

const CUSTOMER = { id: "customer-1", role: "user" };
const AGENT = { id: "agent-1", role: "agent" };

function directory(input: { openTicketId: string | null; accounts?: Record<string, string> }) {
  const roles: Record<string, string> = { "customer-1": "user", ...input.accounts };
  const findAccount = vi.fn<ImpersonationDirectory["findAccount"]>(async (userId) => {
    const role = roles[userId];
    return role === undefined ? null : { id: userId, role };
  });
  const findTarget = vi.fn<ImpersonationDirectory["findTarget"]>(async () => ({
    openTicketId: input.openTicketId,
    profileKind: "seller",
  }));
  return { findAccount, findTarget };
}

describe("assertMayImpersonate: the server check behind every way in", () => {
  it("lets an agent into a customer with an open ticket", async () => {
    const call = { actor: AGENT, body: { userId: CUSTOMER.id } };
    await expect(assertMayImpersonate(call, directory({ openTicketId: "t-1" }))).resolves.toBe(
      undefined,
    );
  });

  it("refuses an agent calling the API for a customer without an open ticket", async () => {
    const call = { actor: AGENT, body: { userId: CUSTOMER.id } };
    await expect(assertMayImpersonate(call, directory({ openTicketId: null }))).rejects.toThrow(
      "chamado aberto",
    );
  });

  it("refuses an agent trying to enter an admin account", async () => {
    const call = { actor: AGENT, body: { userId: "admin-1" } };
    const accounts = { "admin-1": "admin" };
    await expect(
      assertMayImpersonate(call, directory({ openTicketId: "t-1", accounts })),
    ).rejects.toThrow("membro da equipe");
  });

  it("reads a numeric id the way the plugin does", async () => {
    const call = { actor: AGENT, body: { userId: 42 } };
    const { findAccount, findTarget } = directory({
      openTicketId: null,
      accounts: { "42": "user" },
    });
    await expect(assertMayImpersonate(call, { findAccount, findTarget })).rejects.toThrow(
      "chamado aberto",
    );
    expect(findAccount).toHaveBeenCalledWith("42");
  });

  it("refuses on its own a call without a session, a readable body or a known account", async () => {
    const fake = directory({ openTicketId: "t-1" });
    await expect(assertMayImpersonate({ actor: null, body: {} }, fake)).rejects.toThrow(
      "Entre na sua conta da equipe",
    );
    await expect(assertMayImpersonate({ actor: AGENT, body: {} }, fake)).rejects.toThrow(
      "Informe a conta do cliente",
    );
    await expect(
      assertMayImpersonate({ actor: AGENT, body: { userId: "missing" } }, fake),
    ).rejects.toThrow("Conta do cliente não encontrada");
  });
});

describe("visitDetails: what the timeline says about a visit", () => {
  const target = {
    openTicketId: "6cfb95aa-0000-4000-8000-000000000000",
    profileKind: "supplier",
  } as const;

  it("names the ticket behind an agent's visit", () => {
    expect(visitDetails({ impersonatorRole: "agent", target })).toEqual({
      profileKind: "supplier",
      ticketCode: "6CFB95",
    });
  });

  it("names no ticket for an admin, whose visit needs none", () => {
    expect(visitDetails({ impersonatorRole: "admin", target })).toEqual({
      profileKind: "supplier",
      ticketCode: null,
    });
  });
});
