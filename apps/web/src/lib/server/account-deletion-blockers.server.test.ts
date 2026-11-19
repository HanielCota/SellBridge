import { isAppError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const NO_MONEY = { count: 0, amountCents: 0, lastReleaseAt: null, awaitingDelivery: 0 };
const NOTHING = {
  ordersToShip: 0,
  ordersOnTheWay: 0,
  parcelsToShip: 0,
  parcelsOnTheWay: 0,
  paymentsInProgress: 0,
  sellerMoneyHeld: NO_MONEY,
  supplierMoneyToReceive: NO_MONEY,
  returnsInReview: 0,
};

const mocks = vi.hoisted(() => ({
  findDeletionBlockers:
    vi.fn<(database: unknown, input: { tenantIds: string[] }) => Promise<unknown>>(),
  listMemberships: vi.fn<(userId: string) => Promise<unknown[]>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/membership", () => ({ listMemberships: mocks.listMemberships }));
vi.mock("@sellbridge/database/repositories", () => ({
  findDeletionBlockers: mocks.findDeletionBlockers,
}));

const { assertNothingLeftToResolve, listDeletionBlockers } =
  await import("./account-deletion-blockers.server");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listMemberships.mockResolvedValue([
    { organizationId: "tenant-seller", slug: "loja-da-ana", kind: "seller" },
    { organizationId: "tenant-shared", slug: "loja-com-socio", kind: "seller" },
  ]);
  mocks.findDeletionBlockers.mockResolvedValue(NOTHING);
});

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

describe("assertNothingLeftToResolve", () => {
  it("lets the deletion go on when nothing is left", async () => {
    await expect(
      assertNothingLeftToResolve({ userId: "user-1", tenantIds: ["tenant-seller"] }),
    ).resolves.toBeUndefined();
  });

  it("refuses with the list of what is left", async () => {
    mocks.findDeletionBlockers.mockResolvedValue({
      ...NOTHING,
      ordersToShip: 2,
      returnsInReview: 1,
    });

    const error = await rejection(
      assertNothingLeftToResolve({ userId: "user-1", tenantIds: ["tenant-seller"] }),
    );

    expect(isAppError(error) && error.code).toBe("CONFLICT");
    expect(isAppError(error) && error.userMessage).toBe(
      "Antes de excluir a conta, resolva: 2 pedidos para enviar; 1 devolução em análise.",
    );
  });

  it("does not look at a workspace that stays with another owner", async () => {
    mocks.findDeletionBlockers.mockResolvedValue({ ...NOTHING, ordersToShip: 2 });

    const lines = await listDeletionBlockers({ userId: "user-1", tenantIds: [], now: new Date() });

    expect(lines).toEqual([]);
    expect(mocks.findDeletionBlockers).not.toHaveBeenCalled();
  });

  it("reads each workspace that goes with the account, under its own profile", async () => {
    await listDeletionBlockers({ userId: "user-1", tenantIds: ["tenant-seller"], now: new Date() });

    expect(mocks.findDeletionBlockers).toHaveBeenCalledTimes(1);
    expect(mocks.findDeletionBlockers.mock.calls[0]?.[1].tenantIds).toEqual(["tenant-seller"]);
  });
});
