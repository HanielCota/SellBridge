import { DAY_MILLISECONDS } from "@sellbridge/shared/time";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierFlags, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestUsers } from "../testing/fixtures.ts";
import {
  applySupplierFlag,
  listActiveSupplierFlags,
  getFlaggableSupplierName,
  listTeamSupplierFlags,
  revokeSupplierFlag,
} from "./supplier-flags.ts";

const database = createTestDatabase();
let staff: Awaited<ReturnType<typeof createTestUsers>>;
const supplierIds: string[] = [];

function staffId(): string {
  const id = staff.ids[0];
  if (id === undefined) {
    throw new Error("usuário de teste não criado");
  }
  return id;
}

async function createSupplier(): Promise<string> {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: "Fornecedor de teste das flags", niche: "Teste", state: "ZZ", city: "X" })
    .returning({ id: suppliers.id });
  if (supplier === undefined) {
    throw new Error("fornecedor não criado");
  }
  supplierIds.push(supplier.id);
  return supplier.id;
}

async function appliedAt(flagId: string): Promise<Date> {
  const [flag] = await database
    .select({ createdAt: supplierFlags.createdAt })
    .from(supplierFlags)
    .where(eq(supplierFlags.id, flagId));
  if (flag === undefined) {
    throw new Error("flag não encontrada");
  }
  return flag.createdAt;
}

function daysLater(start: Date, days: number): Date {
  return new Date(start.getTime() + days * DAY_MILLISECONDS);
}

beforeAll(async () => {
  staff = await createTestUsers(database, 1);
});

afterAll(async () => {
  await database.delete(suppliers).where(inArray(suppliers.id, supplierIds));
  await staff.cleanup();
  await database.$client.end();
});

describe("supplier flags", () => {
  it("expires exactly 90 days after it was applied", async () => {
    const supplierId = await createSupplier();
    const flag = await applySupplierFlag(database, {
      supplierId,
      reason: "slow_support",
      note: "",
      createdBy: staffId(),
    });
    const start = await appliedAt(flag.id);

    expect(flag.expiresAt.getTime() - start.getTime()).toBe(90 * DAY_MILLISECONDS);
    expect(await listActiveSupplierFlags(database, supplierId, daysLater(start, 89))).toHaveLength(
      1,
    );
    expect(await listActiveSupplierFlags(database, supplierId, daysLater(start, 90))).toEqual([]);
    expect(await listActiveSupplierFlags(database, supplierId, daysLater(start, 91))).toEqual([]);
    const team = await listTeamSupplierFlags(database, supplierId, daysLater(start, 90));
    expect(team.flags.map((entry) => entry.status)).toEqual(["expired"]);
    expect(team.activeCount).toBe(0);
  });

  it("stops counting a revoked flag and keeps who revoked it for the team only", async () => {
    const supplierId = await createSupplier();
    const flag = await applySupplierFlag(database, {
      supplierId,
      reason: "order_error",
      note: "Pedido com cor trocada",
      createdBy: staffId(),
    });
    await revokeSupplierFlag(database, {
      supplierId,
      flagId: flag.id,
      revokedBy: staffId(),
      revokeNote: "Aplicada por engano",
      now: new Date(),
    });

    expect(await listActiveSupplierFlags(database, supplierId, new Date())).toEqual([]);
    const team = await listTeamSupplierFlags(database, supplierId, new Date());
    expect(team.flags[0]).toMatchObject({
      status: "revoked",
      revokeNote: "Aplicada por engano",
      revokedByName: "Usuário 0",
      createdByName: "Usuário 0",
    });
    expect(team.activeCount).toBe(0);
  });

  it("refuses to revoke a flag twice or through another supplier", async () => {
    const supplierId = await createSupplier();
    const otherSupplierId = await createSupplier();
    const flag = await applySupplierFlag(database, {
      supplierId,
      reason: "stale_catalog",
      note: "",
      createdBy: staffId(),
    });
    const revoke = { flagId: flag.id, revokedBy: staffId(), revokeNote: "Ok", now: new Date() };

    await expect(
      revokeSupplierFlag(database, { ...revoke, supplierId: otherSupplierId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await revokeSupplierFlag(database, { ...revoke, supplierId });
    await expect(revokeSupplierFlag(database, { ...revoke, supplierId })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("refuses to revoke an expired flag", async () => {
    const supplierId = await createSupplier();
    const flag = await applySupplierFlag(database, {
      supplierId,
      reason: "stale_catalog",
      note: "",
      createdBy: staffId(),
    });
    const start = await appliedAt(flag.id);

    await expect(
      revokeSupplierFlag(database, {
        supplierId,
        flagId: flag.id,
        revokedBy: staffId(),
        revokeNote: "Tarde demais",
        now: daysLater(start, 90),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("shows the supplier only its own active flags, newest first, without the team's fields", async () => {
    const supplierId = await createSupplier();
    const otherSupplierId = await createSupplier();
    const first = await applySupplierFlag(database, {
      supplierId,
      reason: "product_listing_error",
      note: "",
      createdBy: staffId(),
    });
    const second = await applySupplierFlag(database, {
      supplierId,
      reason: "contact_attempt",
      note: "Telefone na descrição",
      createdBy: staffId(),
    });
    await applySupplierFlag(database, {
      supplierId: otherSupplierId,
      reason: "order_error",
      note: "",
      createdBy: staffId(),
    });

    const flags = await listActiveSupplierFlags(database, supplierId, new Date());
    expect(flags.map((flag) => flag.id)).toEqual([second.id, first.id]);
    expect(Object.keys(flags[0] ?? {}).toSorted()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "note",
      "reason",
    ]);
  });

  it("asks the team to look at a supplier with 3 active flags", async () => {
    const supplierId = await createSupplier();
    for (const reason of ["slow_support", "order_error", "stale_catalog"] as const) {
      await applySupplierFlag(database, { supplierId, reason, note: "", createdBy: staffId() });
    }

    const team = await listTeamSupplierFlags(database, supplierId, new Date());
    expect(team.activeCount).toBe(3);
    expect(team.needsAttention).toBe(true);
  });

  it("refuses 'other' without a note at the database too", async () => {
    const supplierId = await createSupplier();
    await expect(
      applySupplierFlag(database, { supplierId, reason: "other", note: " ", createdBy: staffId() }),
    ).rejects.toMatchObject({ cause: { constraint_name: "supplier_flags_note_check" } });
  });

  it("reads only the supplier's name for the team's flags page", async () => {
    const supplierId = await createSupplier();
    expect(await getFlaggableSupplierName(database, supplierId)).toBe(
      "Fornecedor de teste das flags",
    );
    await expect(
      getFlaggableSupplierName(database, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a flag for a supplier that does not exist", async () => {
    await expect(
      applySupplierFlag(database, {
        supplierId: "00000000-0000-4000-8000-000000000000",
        reason: "slow_support",
        note: "",
        createdBy: staffId(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
