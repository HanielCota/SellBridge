import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import { recordWebhookEvent } from "@sellbridge/database/repositories";
import { type MarketplaceQuestion, parseMercadoLivreNotice } from "@sellbridge/marketplaces";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPublishedTestTarget,
  createTestProduct,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createQuestionSweepProcessor } from "./buyer-question-sweep.ts";
import type { ReadQuestion } from "./buyer-question-sync.ts";
import type { NoticeReaders } from "./marketplace-notice.ts";
import { createWebhookEventProcessor } from "./webhook-event.ts";

const environment = createWorkerTestEnvironment();
const { database, cipher } = environment;
const acquireRateLimit = vi.fn<(key: string) => Promise<void>>();
const readQuestion = vi.fn<ReadQuestion>();
const searchUnanswered = vi.fn<(store: unknown) => Promise<MarketplaceQuestion[]>>();
const baseReaders: NoticeReaders = {
  parseNotice: (_marketplace, topic, rawPayload) => parseMercadoLivreNotice(topic, rawPayload),
  readShipmentOrders: vi.fn<NoticeReaders["readShipmentOrders"]>(),
  readShipping: vi.fn<NoticeReaders["readShipping"]>(),
  readClaim: vi.fn<NoticeReaders["readClaim"]>(),
};

function webhookProcessor(readers: NoticeReaders) {
  return createWebhookEventProcessor({
    ...environment,
    acquireRateLimit,
    requestStockSync: async () => {},
    requestAutoForward: async () => {},
    requestCatchUp: async () => {},
    notices: readers,
  });
}

const processWebhook = webhookProcessor({ ...baseReaders, readQuestion });

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let storeId = "";
/** Numeric like a Mercado Livre seller id, unique per run. */
const shopId = String(Date.now() + 7);
const itemId = `MLB${Date.now()}`;
const eventIds: string[] = [];

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  catalog = await createTestProduct(database, { sku: "QST-1", title: "Capa", stock: 9 });
  const [store] = await database
    .insert(schema.storeConnections)
    .values({
      tenantId: tenants.first,
      marketplace: "mercado_livre",
      externalShopId: shopId,
      shopName: "Loja perguntas",
      accessTokenEnc: cipher.encrypt("ml-access-token"),
      refreshTokenEnc: cipher.encrypt("ml-refresh-token"),
      expiresAt: new Date(Date.now() + 3_600_000),
      status: "connected",
    })
    .returning();
  if (store === undefined) throw new Error("loja de teste");
  storeId = store.id;
  await createPublishedTestTarget(database, {
    tenantId: tenants.first,
    productId: catalog.productId,
    storeId,
    title: "Capa de celular",
    externalId: itemId,
  });
});

afterAll(async () => {
  await database.delete(schema.webhookEvents).where(inArray(schema.webhookEvents.id, eventIds));
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

beforeEach(() => {
  acquireRateLimit.mockReset();
  readQuestion.mockReset();
  searchUnanswered.mockReset();
  acquireRateLimit.mockResolvedValue(undefined);
});

let questionCounter = 0;

function question(overrides: Partial<MarketplaceQuestion> = {}): MarketplaceQuestion {
  questionCounter += 1;
  return {
    externalQuestionId: `${Date.now()}${questionCounter}`,
    externalItemId: itemId,
    status: "unanswered",
    text: "Serve no modelo de 2019?",
    askedAt: new Date("2026-11-21T10:00:00.000Z"),
    answerText: null,
    answeredAt: null,
    ...overrides,
  };
}

/** A questions notification as Mercado Livre stores it. */
async function notice(questionId: string) {
  const result = await recordWebhookEvent(database, {
    marketplace: "mercado_livre",
    externalEventId: randomUUID(),
    topic: "questions",
    rawPayload: {
      _id: randomUUID(),
      resource: `/questions/${questionId}`,
      user_id: shopId,
      topic: "questions",
      application_id: 1,
    },
    signatureValid: true,
  });
  if (result.status !== "created") throw new Error("evento não criado");
  eventIds.push(result.id);
  return result.id;
}

function job(webhookEventId: string) {
  return { data: { webhookEventId }, attemptsMade: 0, maxAttempts: 5 };
}

async function storedQuestions(externalQuestionId: string) {
  return database
    .select()
    .from(schema.buyerQuestions)
    .where(eq(schema.buyerQuestions.externalQuestionId, externalQuestionId));
}

async function processedNote(webhookEventId: string) {
  const [event] = await database
    .select({ processedAt: schema.webhookEvents.processedAt, error: schema.webhookEvents.error })
    .from(schema.webhookEvents)
    .where(eq(schema.webhookEvents.id, webhookEventId));
  return event;
}

describe("questions notification", () => {
  it("reads the question again with the store's token and stores it", async () => {
    const asked = question();
    readQuestion.mockResolvedValue(asked);
    const eventId = await notice(asked.externalQuestionId);

    const outcome = await processWebhook(job(eventId));

    expect(outcome).toBe("question_saved");
    expect(readQuestion).toHaveBeenCalledWith(
      { externalShopId: shopId, accessToken: "ml-access-token" },
      asked.externalQuestionId,
    );
    const [row] = await storedQuestions(asked.externalQuestionId);
    expect(row).toMatchObject({ tenantId: tenants.first, status: "unanswered" });
    expect((await processedNote(eventId))?.processedAt).not.toBeNull();
  });

  it("keeps one question when Mercado Livre repeats the notification", async () => {
    const asked = question();
    readQuestion.mockResolvedValue(asked);

    await processWebhook(job(await notice(asked.externalQuestionId)));
    await processWebhook(job(await notice(asked.externalQuestionId)));

    expect(await storedQuestions(asked.externalQuestionId)).toHaveLength(1);
  });

  it("marks a question deleted on Mercado Livre as removed", async () => {
    const asked = question();
    readQuestion.mockResolvedValueOnce(asked).mockResolvedValueOnce(null);
    await processWebhook(job(await notice(asked.externalQuestionId)));

    const outcome = await processWebhook(job(await notice(asked.externalQuestionId)));

    expect(outcome).toBe("question_gone");
    const [row] = await storedQuestions(asked.externalQuestionId);
    expect(row?.status).toBe("removed");
  });

  it("records an answer given on Mercado Livre itself", async () => {
    const asked = question();
    readQuestion
      .mockResolvedValueOnce(asked)
      .mockResolvedValueOnce({ ...asked, status: "answered", answerText: "Serve sim." });
    await processWebhook(job(await notice(asked.externalQuestionId)));

    await processWebhook(job(await notice(asked.externalQuestionId)));

    const [row] = await storedQuestions(asked.externalQuestionId);
    expect(row).toMatchObject({ status: "answered", answerText: "Serve sim." });
  });

  it("leaves a question on an item sold outside SellBridge to the marketplace", async () => {
    const asked = question({ externalItemId: "MLB-OUTSIDE" });
    readQuestion.mockResolvedValue(asked);
    const eventId = await notice(asked.externalQuestionId);

    const outcome = await processWebhook(job(eventId));

    expect(outcome).toBe("question_outside_sellbridge");
    expect(await storedQuestions(asked.externalQuestionId)).toHaveLength(0);
  });

  it("ignores the topic while buyer questions are off", async () => {
    const processWithoutQuestions = webhookProcessor(baseReaders);
    const asked = question();
    const eventId = await notice(asked.externalQuestionId);

    const outcome = await processWithoutQuestions(job(eventId));

    expect(outcome).toBe("ignored_topic");
    expect(readQuestion).not.toHaveBeenCalled();
    expect(await storedQuestions(asked.externalQuestionId)).toHaveLength(0);
  });
});

describe("question sweep", () => {
  const sweep = createQuestionSweepProcessor({
    database,
    cipher,
    acquireRateLimit,
    readQuestion,
    searchUnanswered,
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  });

  it("stores waiting questions a lost notification never brought", async () => {
    const lost = question();
    searchUnanswered.mockResolvedValue([lost]);

    await sweep();

    const [row] = await storedQuestions(lost.externalQuestionId);
    expect(row?.status).toBe("unanswered");
  });

  it("brings up to date a question answered on Mercado Livre", async () => {
    const asked = question();
    readQuestion.mockResolvedValueOnce(asked);
    await processWebhook(job(await notice(asked.externalQuestionId)));
    searchUnanswered.mockResolvedValue([]);
    readQuestion.mockImplementation(async (_store, questionId) =>
      questionId === asked.externalQuestionId
        ? { ...asked, status: "answered", answerText: "Serve sim." }
        : null,
    );

    await sweep();

    const [row] = await storedQuestions(asked.externalQuestionId);
    expect(row?.status).toBe("answered");
  });
});
