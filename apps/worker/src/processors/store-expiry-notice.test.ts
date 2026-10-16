import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import type { OutgoingEmail } from "@sellbridge/shared/mailer";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestStore,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { notifyExpiredStores } from "./store-expiry-notice.ts";

const environment = createWorkerTestEnvironment();
const { database } = environment;
const sendEmail = vi.fn<(email: OutgoingEmail) => Promise<void>>();
const APP_URL = "https://app.sellbridge.test";

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
const userIds: string[] = [];

/** A user of the tenant with the given role; returns their e-mail. */
async function addMember(tenantId: string, role: "owner" | "member"): Promise<string> {
  const id = randomUUID();
  const email = `expiry-${id}@sellbridge.test`;
  await database.insert(schema.user).values({
    id,
    name: `Pessoa ${role}`,
    email,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await database.insert(schema.member).values({
    id: randomUUID(),
    organizationId: tenantId,
    userId: id,
    role,
    createdAt: new Date(),
  });
  userIds.push(id);
  return email;
}

/** Expires the store at `at` under a unique name, so each test finds its own e-mail. */
async function expireStore(storeId: string, at: Date): Promise<string> {
  const shopName = `Loja expirada ${randomUUID().slice(0, 8)}`;
  await database
    .update(schema.storeConnections)
    .set({ status: "expired", lastError: "Token revogado", shopName, updatedAt: at })
    .where(eq(schema.storeConnections.id, storeId));
  return shopName;
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
});

afterAll(async () => {
  await database.delete(schema.user).where(inArray(schema.user.id, userIds));
  await tenants.cleanup();
  await database.$client.end();
});

beforeEach(() => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue(undefined);
});

describe("store expiry notice", () => {
  it("e-mails the owners once when a store loses its access, never the other members", async () => {
    const ownerEmail = await addMember(tenants.first, "owner");
    await addMember(tenants.first, "member");
    const store = await createTestStore(environment, tenants.first);
    const shopName = await expireStore(store.id, new Date());

    await notifyExpiredStores({ database, sendEmail, appUrl: APP_URL });
    // Other expired stores in the shared test database may get theirs too: only this one counts.
    const aboutThisStore = () =>
      sendEmail.mock.calls.flatMap(([email]) => (email.subject.includes(shopName) ? [email] : []));
    const [email] = aboutThisStore();
    expect(aboutThisStore()).toHaveLength(1);
    expect(email?.to).toBe(ownerEmail);
    expect(email?.text).toContain(`${APP_URL}/lojas`);

    // The next run finds the same expired store: no second e-mail.
    await notifyExpiredStores({ database, sendEmail, appUrl: APP_URL });
    expect(aboutThisStore()).toHaveLength(1);
  });

  it("does not e-mail about stores that expired long before (first run after a deploy)", async () => {
    await addMember(tenants.first, "owner");
    const store = await createTestStore(environment, tenants.first);
    const shopName = await expireStore(store.id, new Date(Date.now() - 3 * 86_400_000));
    await notifyExpiredStores({ database, sendEmail, appUrl: APP_URL });
    const subjects = sendEmail.mock.calls.map(([email]) => email.subject);
    expect(subjects.some((subject) => subject.includes(shopName))).toBe(false);
  });

  it("tries again on the next run when the e-mail could not be sent", async () => {
    await addMember(tenants.first, "owner");
    const store = await createTestStore(environment, tenants.first);
    const shopName = await expireStore(store.id, new Date());
    sendEmail.mockRejectedValue(new Error("Resend fora do ar"));
    await notifyExpiredStores({ database, sendEmail, appUrl: APP_URL });
    sendEmail.mockReset();
    sendEmail.mockResolvedValue(undefined);
    await notifyExpiredStores({ database, sendEmail, appUrl: APP_URL });
    const subjects = sendEmail.mock.calls.map(([email]) => email.subject);
    expect(subjects.some((subject) => subject.includes(shopName))).toBe(true);
  });
});
