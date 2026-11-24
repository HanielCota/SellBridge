import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buyerQuestions } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  publishTestProduct,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  type BuyerQuestionReading,
  claimBuyerQuestionAnswer,
  countWaitingBuyerQuestions,
  finishBuyerQuestionAnswer,
  listBuyerQuestions,
  listStoreWaitingQuestionIds,
  markBuyerQuestionGone,
  releaseBuyerQuestionAnswer,
  saveBuyerQuestion,
} from "./buyer-questions.ts";
import { buyerQuestionEvents } from "./notification-question-events.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let product: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let store = { id: "", tenantId: "", marketplace: "mock" as const };
let otherStore = { id: "", tenantId: "", marketplace: "mock" as const };
let itemId = "";
let otherItemId = "";

function reading(overrides: Partial<BuyerQuestionReading> = {}): BuyerQuestionReading {
  return {
    externalQuestionId: String(Date.now()) + String(Math.floor(Math.random() * 100_000)),
    externalItemId: itemId,
    status: "unanswered",
    text: "Serve no modelo de 2019?",
    askedAt: new Date("2026-11-21T10:00:00.000Z"),
    answerText: null,
    answeredAt: null,
    ...overrides,
  };
}

async function storedQuestion(externalQuestionId: string) {
  const [row] = await database
    .select()
    .from(buyerQuestions)
    .where(eq(buyerQuestions.externalQuestionId, externalQuestionId));
  if (row === undefined) {
    throw new Error(`question ${externalQuestionId} not stored`);
  }
  return row;
}

async function savedWaitingQuestion(overrides: Partial<BuyerQuestionReading> = {}) {
  const question = reading(overrides);
  await saveBuyerQuestion(database, { store, question });
  return storedQuestion(question.externalQuestionId);
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 1);
  const created = await upsertStoreConnection(
    database,
    testStoreInput(tenants.tenantA, `questions-${randomUUID()}`),
  );
  store = { id: created.id, tenantId: tenants.tenantA, marketplace: "mock" };
  const other = await upsertStoreConnection(
    database,
    testStoreInput(tenants.tenantB, `questions-${randomUUID()}`),
  );
  otherStore = { id: other.id, tenantId: tenants.tenantB, marketplace: "mock" };
  product = await createTestSupplierProduct(database, {
    sku: `Q-${randomUUID().slice(0, 8)}`,
    title: "Capa de celular",
    costCents: 1000,
    suggestedPriceCents: 3000,
    imageUrls: ["https://example.test/capa.jpg"],
  });
  await publishTestProduct(database, product.productId, [
    { tenantId: store.tenantId, storeId: store.id },
    { tenantId: otherStore.tenantId, storeId: otherStore.id },
  ]);
  itemId = `EXT-${product.productId}-${store.tenantId}`;
  otherItemId = `EXT-${product.productId}-${otherStore.tenantId}`;
});

afterAll(async () => {
  await tenants.cleanup();
  await product.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("saveBuyerQuestion", () => {
  it("stores a question on a SellBridge publication", async () => {
    const question = reading();

    const result = await saveBuyerQuestion(database, { store, question });

    expect(result).toBe("created");
    const row = await storedQuestion(question.externalQuestionId);
    expect(row).toMatchObject({
      tenantId: store.tenantId,
      storeConnectionId: store.id,
      status: "unanswered",
      text: "Serve no modelo de 2019?",
      answerText: null,
    });
  });

  it("keeps one question when the same notification arrives twice", async () => {
    const question = reading();

    await saveBuyerQuestion(database, { store, question });
    const second = await saveBuyerQuestion(database, { store, question });

    expect(second).toBe("updated");
    const rows = await database
      .select({ id: buyerQuestions.id })
      .from(buyerQuestions)
      .where(eq(buyerQuestions.externalQuestionId, question.externalQuestionId));
    expect(rows).toHaveLength(1);
  });

  it("leaves a question on an item published outside SellBridge alone", async () => {
    const question = reading({ externalItemId: "MLB-NOT-OURS" });

    const result = await saveBuyerQuestion(database, { store, question });

    expect(result).toBe("outside_sellbridge");
    const rows = await database
      .select({ id: buyerQuestions.id })
      .from(buyerQuestions)
      .where(eq(buyerQuestions.externalQuestionId, question.externalQuestionId));
    expect(rows).toHaveLength(0);
  });

  it("records an answer given on the marketplace itself", async () => {
    const question = reading();
    await saveBuyerQuestion(database, { store, question });

    await saveBuyerQuestion(database, {
      store,
      question: {
        ...question,
        status: "answered",
        answerText: "Serve sim.",
        answeredAt: new Date("2026-11-21T11:00:00.000Z"),
      },
    });

    const row = await storedQuestion(question.externalQuestionId);
    expect(row.status).toBe("answered");
    expect(row.answerText).toBe("Serve sim.");
    expect(row.answeredByUserId).toBeNull();
  });

  it("does not reopen an answered question when an older reading arrives late", async () => {
    const question = reading();
    await saveBuyerQuestion(database, {
      store,
      question: { ...question, status: "answered", answerText: "Serve sim." },
    });

    const result = await saveBuyerQuestion(database, { store, question });

    expect(result).toBe("kept");
    expect((await storedQuestion(question.externalQuestionId)).status).toBe("answered");
  });

  it("keeps the stored text when the marketplace bans the question and empties it", async () => {
    const question = reading();
    await saveBuyerQuestion(database, { store, question });

    await saveBuyerQuestion(database, {
      store,
      question: { ...question, status: "removed", text: "" },
    });

    const row = await storedQuestion(question.externalQuestionId);
    expect(row.status).toBe("removed");
    expect(row.text).toBe("Serve no modelo de 2019?");
  });
});

describe("markBuyerQuestionGone", () => {
  it("removes a question the marketplace no longer has", async () => {
    const row = await savedWaitingQuestion();

    await markBuyerQuestionGone(database, {
      marketplace: "mock",
      externalQuestionId: row.externalQuestionId,
    });

    expect((await storedQuestion(row.externalQuestionId)).status).toBe("removed");
  });
});

describe("claimBuyerQuestionAnswer", () => {
  const now = new Date("2026-11-21T12:00:00.000Z");

  it("gives the question to the first click only", async () => {
    const row = await savedWaitingQuestion();
    const claim = { tenantId: store.tenantId, questionId: row.id, now };

    const [first, second] = await Promise.all([
      claimBuyerQuestionAnswer(database, claim),
      claimBuyerQuestionAnswer(database, claim),
    ]);

    const kinds = [first.kind, second.kind].toSorted();
    expect(kinds).toEqual(["already_sending", "claimed"]);
  });

  it("frees a send that never finished after two minutes", async () => {
    const row = await savedWaitingQuestion();
    await claimBuyerQuestionAnswer(database, { tenantId: store.tenantId, questionId: row.id, now });
    const later = new Date(now.getTime() + 2 * 60 * 1000 + 1);

    const result = await claimBuyerQuestionAnswer(database, {
      tenantId: store.tenantId,
      questionId: row.id,
      now: later,
    });

    expect(result.kind).toBe("claimed");
  });

  it("refuses a question already answered", async () => {
    const row = await savedWaitingQuestion({ status: "answered", answerText: "Sim." });

    const result = await claimBuyerQuestionAnswer(database, {
      tenantId: store.tenantId,
      questionId: row.id,
      now,
    });

    expect(result).toEqual({ kind: "settled", status: "answered" });
  });

  it("refuses a question the marketplace is reviewing", async () => {
    const row = await savedWaitingQuestion({ status: "under_review" });

    const result = await claimBuyerQuestionAnswer(database, {
      tenantId: store.tenantId,
      questionId: row.id,
      now,
    });

    expect(result.kind).toBe("under_review");
  });

  it("reads another tenant's question as not found", async () => {
    const row = await savedWaitingQuestion();

    const result = await claimBuyerQuestionAnswer(database, {
      tenantId: otherStore.tenantId,
      questionId: row.id,
      now,
    });

    expect(result).toEqual({ kind: "not_found" });
    expect((await storedQuestion(row.externalQuestionId)).answerSendingSince).toBeNull();
  });
});

describe("finishBuyerQuestionAnswer", () => {
  const now = new Date("2026-11-21T12:00:00.000Z");

  it("stores the published answer and who wrote it", async () => {
    const row = await savedWaitingQuestion();
    await claimBuyerQuestionAnswer(database, { tenantId: store.tenantId, questionId: row.id, now });
    const userId = users.ids[0] ?? "";

    await finishBuyerQuestionAnswer(database, {
      questionId: row.id,
      answeredByUserId: userId,
      reading: {
        ...reading({ externalQuestionId: row.externalQuestionId }),
        status: "answered",
        answerText: "Serve sim.",
        answeredAt: now,
      },
    });

    const stored = await storedQuestion(row.externalQuestionId);
    expect(stored).toMatchObject({
      status: "answered",
      answerText: "Serve sim.",
      answeredByUserId: userId,
      answerSendingSince: null,
    });
  });

  it("marks the question removed when the marketplace no longer has it", async () => {
    const row = await savedWaitingQuestion();

    await finishBuyerQuestionAnswer(database, {
      questionId: row.id,
      reading: null,
      answeredByUserId: null,
    });

    expect((await storedQuestion(row.externalQuestionId)).status).toBe("removed");
  });

  it("lets the reseller try again after a failed send", async () => {
    const row = await savedWaitingQuestion();
    await claimBuyerQuestionAnswer(database, { tenantId: store.tenantId, questionId: row.id, now });

    await releaseBuyerQuestionAnswer(database, row.id);

    const retry = await claimBuyerQuestionAnswer(database, {
      tenantId: store.tenantId,
      questionId: row.id,
      now,
    });
    expect(retry.kind).toBe("claimed");
  });
});

describe("listBuyerQuestions", () => {
  it("lists only the tenant's own questions with the publication", async () => {
    const own = await savedWaitingQuestion({ askedAt: new Date("2020-01-01T00:00:00.000Z") });
    const foreign = reading({ externalItemId: otherItemId });
    await saveBuyerQuestion(database, { store: otherStore, question: foreign });

    const rows = await listBuyerQuestions(database, {
      tenantId: store.tenantId,
      view: "waiting",
      limit: 200,
      cursor: null,
    });

    expect(rows[0]).toMatchObject({
      id: own.id,
      listingTitle: `Anúncio ${product.productId}`,
      imageUrl: "https://example.test/capa.jpg",
      answerSending: false,
    });
    const foreignRow = await storedQuestion(foreign.externalQuestionId);
    expect(rows.some((row) => row.id === foreignRow.id)).toBe(false);
  });

  it("continues after the last question of the previous page", async () => {
    const first = await savedWaitingQuestion({ askedAt: new Date("2019-01-01T00:00:00.000Z") });
    const second = await savedWaitingQuestion({ askedAt: new Date("2019-01-02T00:00:00.000Z") });

    const page = await listBuyerQuestions(database, {
      tenantId: store.tenantId,
      view: "waiting",
      limit: 1,
      cursor: { askedAt: first.askedAt, id: first.id },
    });

    expect(page.map((row) => row.id)).toEqual([second.id]);
  });
});

describe("waiting question counts", () => {
  it("counts, lists for the bell and for the safety net only unanswered questions", async () => {
    const waiting = await savedWaitingQuestion();
    await savedWaitingQuestion({ status: "answered", answerText: "Sim." });

    const total = await countWaitingBuyerQuestions(database, store.tenantId);
    const events = await buyerQuestionEvents(database, store.tenantId, 200);
    const storeIds = await listStoreWaitingQuestionIds(database, {
      storeConnectionId: store.id,
      askedBefore: new Date("2030-01-01T00:00:00.000Z"),
    });

    const unanswered = await database
      .select({ id: buyerQuestions.id })
      .from(buyerQuestions)
      .where(eq(buyerQuestions.status, "unanswered"));
    expect(total).toBeGreaterThan(0);
    expect(events.every((event) => unanswered.some((row) => row.id === event.entityId))).toBe(true);
    expect(storeIds).toContain(waiting.externalQuestionId);
  });
});
