import { describe, expect, it } from "vitest";
import { PROFILE_KINDS, type ProfileKind } from "./profile-kind.ts";
import {
  alwaysNeedsHuman,
  formatAssistantNote,
  isAssistantMessage,
  type SupportAssistantQuestion,
} from "./support-assistant.ts";
import { SUPPORT_FAQ } from "./support-assistant-answers.ts";
import {
  createFaqSupportAssistant,
  matchFaqAnswer,
  normalizeQuestionText,
} from "./support-assistant-faq.ts";
import { OTHER_SITUATION_ID, findSupportTopic } from "./support-topics.ts";
import { TICKET_CATEGORIES } from "./ticket-rules.ts";

function question(overrides: Partial<SupportAssistantQuestion>): SupportAssistantQuestion {
  return { profile: "seller", topic: "other", subtopic: undefined, text: "", ...overrides };
}

describe("faq support assistant", () => {
  it("answers a situation it has a curated answer for", async () => {
    const result = await createFaqSupportAssistant().answer(
      question({ topic: "listing", subtopic: "listing-blocked", text: "O anúncio parou." }),
    );
    expect(result).toMatchObject({ kind: "answer", answer: { id: "seller-listing-paused" } });
  });

  it("reads keywords only in open-ended questions, ignoring accents and case", async () => {
    const assistant = createFaqSupportAssistant();
    const open = await assistant.answer(question({ text: "Quero trocar o CARTÃO da mensalidade" }));
    expect(open).toMatchObject({ kind: "answer", answer: { id: "seller-plan" } });
    const insideTopic = await assistant.answer(
      question({ topic: "listing", subtopic: OTHER_SITUATION_ID, text: "esqueci minha senha" }),
    );
    expect(insideTopic).toMatchObject({ kind: "answer", answer: { id: "password" } });
  });

  it("sends a picked situation without a curated answer to a person", async () => {
    const result = await createFaqSupportAssistant().answer(
      question({ topic: "store", subtopic: "orders-missing", text: "senha publicar plano" }),
    );
    expect(result).toEqual({ kind: "needs_human", reason: "no_match" });
  });

  it("never answers money, order or account-change questions, whatever the text says", async () => {
    const assistant = createFaqSupportAssistant();
    const cases: Partial<SupportAssistantQuestion>[] = [
      { topic: "payment", subtopic: "payout-missing", text: "meu plano e cartão" },
      { topic: "order", subtopic: "cancel-or-return", text: "como encaminhar" },
      { topic: "order", subtopic: OTHER_SITUATION_ID, text: "esqueci a senha" },
      { topic: "account", subtopic: "update-details", text: "senha" },
      { profile: "supplier", topic: "order", subtopic: "address-incomplete", text: "planilha" },
    ];
    for (const overrides of cases) {
      expect(await assistant.answer(question(overrides))).toEqual({
        kind: "needs_human",
        reason: "always_human",
      });
    }
  });

  it("keeps supplier and reseller answers apart", () => {
    expect(
      matchFaqAnswer(question({ profile: "supplier", text: "como publicar" })),
    ).toBeUndefined();
    expect(matchFaqAnswer(question({ profile: "supplier", text: "a planilha deu erro" }))?.id).toBe(
      "supplier-import",
    );
  });
});

describe("curated answers", () => {
  it("point only at situations that exist and are not reserved for a person", () => {
    for (const profile of PROFILE_KINDS) {
      for (const entry of SUPPORT_FAQ[profile]) {
        for (const key of entry.situations) {
          const [category, situationId] = key.split(":");
          const topic = topicOf(profile, category);
          const exists = topic?.situations.some((situation) => situation.id === situationId);
          expect({ key, exists }).toEqual({ key, exists: true });
          const reserved = alwaysNeedsHuman(topic?.category ?? "other", situationId);
          expect({ key, reserved }).toEqual({ key, reserved: false });
        }
      }
    }
  });

  it("have unique ids, steps and keywords already normalized", () => {
    for (const profile of PROFILE_KINDS) {
      const ids = SUPPORT_FAQ[profile].map((entry) => entry.answer.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const entry of SUPPORT_FAQ[profile]) {
        expect(entry.answer.steps.length).toBeGreaterThan(0);
        expect(entry.answer.links.length).toBeGreaterThan(0);
        for (const keyword of entry.keywords) {
          expect(normalizeQuestionText(keyword)).toBe(keyword);
        }
      }
    }
  });
});

describe("assistant note for the team", () => {
  it("lists the title and numbered steps", () => {
    const answer = matchFaqAnswer(question({ text: "esqueci a senha" }));
    expect(answer).toBeDefined();
    if (answer === undefined) {
      return;
    }
    const note = formatAssistantNote(answer);
    expect(note.split("\n")).toEqual([
      "Como trocar a senha",
      "1. Abra Meu perfil.",
      "2. Na parte Senha, digite a senha atual e a nova senha.",
      expect.stringMatching(/^3\. Esqueceu a senha atual\?/),
    ]);
  });

  it("is told apart from customer messages and team notes", () => {
    expect(isAssistantMessage({ isAdmin: false, isInternal: true })).toBe(true);
    expect(isAssistantMessage({ isAdmin: true, isInternal: true })).toBe(false);
    expect(isAssistantMessage({ isAdmin: false, isInternal: false })).toBe(false);
  });
});

function topicOf(profile: ProfileKind, category: string | undefined) {
  const match = TICKET_CATEGORIES.find((candidate) => candidate === category);
  if (match === undefined) {
    return undefined;
  }
  return findSupportTopic(profile, match);
}
