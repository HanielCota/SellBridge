import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../http.ts";
import {
  ANSWERED_QUESTION,
  BANNED_QUESTION,
  OTHER_SELLER_QUESTION,
  QUESTION_SELLER_ID,
  QUESTION_WITH_NANOSECONDS,
  UNANSWERED_QUESTION,
} from "./fixtures/questions.ts";
import {
  answerMercadoLivreQuestion,
  readMercadoLivreQuestion,
  searchMercadoLivreUnansweredQuestions,
} from "./questions.ts";

const store = { externalShopId: QUESTION_SELLER_ID, accessToken: "test-token" };

function setup(...answers: Response[]) {
  const request = vi.fn<FetchLike>(async () => Response.json({}));
  for (const answer of answers) {
    request.mockResolvedValueOnce(answer);
  }
  const config = {
    clientId: "client",
    clientSecret: "secret",
    fetchImplementation: request,
    retry: { retries: 0 },
  };
  return { request, config };
}

function call(request: ReturnType<typeof setup>["request"], index: number) {
  const [input, init] = request.mock.calls[index] ?? [];
  return { url: typeof input === "string" ? input : String(input), init };
}

describe("readMercadoLivreQuestion", () => {
  it("reads an unanswered question without the buyer", async () => {
    const { request, config } = setup(Response.json(UNANSWERED_QUESTION));

    const question = await readMercadoLivreQuestion(config, store, "11436370259");

    expect(question).toEqual({
      externalQuestionId: "11436370259",
      externalItemId: "MLB1623490410",
      status: "unanswered",
      text: "Serve no modelo de 2019?",
      askedAt: new Date("2020-08-20T17:22:01.600Z"),
      answerText: null,
      answeredAt: null,
    });
    expect(call(request, 0).url).toBe(
      "https://api.mercadolibre.com/questions/11436370259?api_version=4",
    );
  });

  it("reads the answer of an answered question", async () => {
    const { config } = setup(Response.json(ANSWERED_QUESTION));

    const question = await readMercadoLivreQuestion(config, store, "11436370259");

    expect(question?.status).toBe("answered");
    expect(question?.answerText).toBe("Serve sim, do 2015 em diante.");
    expect(question?.answeredAt).toEqual(new Date("2020-08-20T18:02:10.000Z"));
  });

  it("reads dates written with nanoseconds", async () => {
    const { config } = setup(Response.json(QUESTION_WITH_NANOSECONDS));

    const question = await readMercadoLivreQuestion(config, store, "11751825075");

    expect(question?.askedAt).toEqual(new Date("2021-02-08T17:51:21.746Z"));
  });

  it("treats a banned question as removed", async () => {
    const { config } = setup(Response.json(BANNED_QUESTION));

    const question = await readMercadoLivreQuestion(config, store, "11764926522");

    expect(question?.status).toBe("removed");
    expect(question?.text).toBe("");
  });

  it("treats a question taken off the listing as removed", async () => {
    const { config } = setup(Response.json({ ...UNANSWERED_QUESTION, deleted_from_listing: true }));

    const question = await readMercadoLivreQuestion(config, store, "11436370259");

    expect(question?.status).toBe("removed");
  });

  it("returns null when the marketplace no longer has the question", async () => {
    const { config } = setup(
      Response.json({ message: "Question not found", error: "not_found" }, { status: 404 }),
    );

    const question = await readMercadoLivreQuestion(config, store, "11436370259");

    expect(question).toBeNull();
  });

  it("refuses a question asked to another seller", async () => {
    const { config } = setup(Response.json(OTHER_SELLER_QUESTION));

    await expect(readMercadoLivreQuestion(config, store, "11436370259")).rejects.toThrow(
      "Pergunta não pertence à loja conectada",
    );
  });

  it("refuses an id that is not a number before calling the marketplace", async () => {
    const { request, config } = setup();

    await expect(readMercadoLivreQuestion(config, store, "../users/me")).rejects.toThrow(
      "Número da pergunta inválido",
    );
    expect(request).not.toHaveBeenCalled();
  });
});

describe("searchMercadoLivreUnansweredQuestions", () => {
  it("lists the store's unanswered questions oldest first", async () => {
    const { request, config } = setup(
      Response.json({
        total: 2,
        limit: 50,
        questions: [UNANSWERED_QUESTION, OTHER_SELLER_QUESTION],
      }),
    );

    const questions = await searchMercadoLivreUnansweredQuestions(config, store);

    expect(questions.map((question) => question.externalQuestionId)).toEqual(["11436370259"]);
    const url = new URL(call(request, 0).url);
    expect(url.pathname).toBe("/questions/search");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      seller_id: QUESTION_SELLER_ID,
      status: "UNANSWERED",
      api_version: "4",
      sort_types: "ASC",
      offset: "0",
      limit: "50",
    });
  });

  it("reads the next page while the first one is full", async () => {
    const fullPage = Array.from({ length: 50 }, (_, index) => ({
      ...UNANSWERED_QUESTION,
      id: 1000 + index,
    }));
    const { request, config } = setup(
      Response.json({ total: 51, questions: fullPage }),
      Response.json({ total: 51, questions: [UNANSWERED_QUESTION] }),
    );

    const questions = await searchMercadoLivreUnansweredQuestions(config, store);

    expect(questions).toHaveLength(51);
    expect(new URL(call(request, 1).url).searchParams.get("offset")).toBe("50");
  });
});

describe("answerMercadoLivreQuestion", () => {
  it("posts the answer once and reads the answered question back", async () => {
    const { request, config } = setup(Response.json(ANSWERED_QUESTION));

    const question = await answerMercadoLivreQuestion(config, store, {
      questionId: "11436370259",
      text: "  Serve sim, do 2015 em diante.  ",
    });

    expect(question.status).toBe("answered");
    expect(request).toHaveBeenCalledTimes(1);
    const { url, init } = call(request, 0);
    expect(url).toBe("https://api.mercadolibre.com/answers");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(typeof init?.body === "string" ? init.body : "")).toEqual({
      question_id: 11436370259,
      text: "Serve sim, do 2015 em diante.",
    });
  });

  it("does not repeat the post when the marketplace fails", async () => {
    const { request, config } = setup(Response.json({ message: "boom" }, { status: 500 }));
    const retrying = { ...config, retry: { retries: 2, baseDelayMilliseconds: 0 } };

    await expect(
      answerMercadoLivreQuestion(retrying, store, { questionId: "11436370259", text: "Sim" }),
    ).rejects.toMatchObject({ code: "EXTERNAL_PROVIDER", details: { retryable: false } });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("refuses an answer longer than 2,000 characters before calling the marketplace", async () => {
    const { request, config } = setup();

    await expect(
      answerMercadoLivreQuestion(config, store, {
        questionId: "11436370259",
        text: "a".repeat(2_001),
      }),
    ).rejects.toThrow("Resposta vazia ou longa demais");
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a blank answer before calling the marketplace", async () => {
    const { request, config } = setup();

    await expect(
      answerMercadoLivreQuestion(config, store, { questionId: "11436370259", text: "   " }),
    ).rejects.toThrow("Resposta vazia ou longa demais");
    expect(request).not.toHaveBeenCalled();
  });
});
