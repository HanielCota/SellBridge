import { billingPlan } from "@sellbridge/shared/billing";
import { describe, expect, it } from "vitest";
import { describeAdminEvent } from "./admin-actions";
import {
  courtesyEndText,
  courtesyFormError,
  defaultCourtesyLastDay,
  planOptionLabel,
  type CourtesyForm,
} from "./courtesy-copy";
import { describeIssue } from "./issue-copy";

const TODAY = "2026-12-10";
const form: CourtesyForm = {
  plan: "elite",
  hasEnd: true,
  lastDay: "2027-02-28",
  reason: "Conta do cliente",
};

describe("courtesy form", () => {
  it("shows the limits the account gets next to the plan name", () => {
    expect(planOptionLabel(billingPlan("elite"))).toBe("Elite · 40 lojas · 20.000 anúncios");
  });

  it("opens with an end one year ahead", () => {
    expect(defaultCourtesyLastDay(TODAY)).toBe("2027-12-10");
    expect(defaultCourtesyLastDay("2028-02-29")).toBe("2029-02-28");
  });

  it("accepts a plan until a day from today on, or with no end", () => {
    expect(courtesyFormError(form, TODAY)).toBeNull();
    expect(courtesyFormError({ ...form, lastDay: TODAY }, TODAY)).toBeNull();
    expect(courtesyFormError({ ...form, hasEnd: false, lastDay: "" }, TODAY)).toBeNull();
  });

  it("asks for a day from today on", () => {
    expect(courtesyFormError({ ...form, lastDay: "2026-12-09" }, TODAY)).toEqual({
      field: "lastDay",
      message: "Escolha uma data de hoje em diante.",
    });
    expect(courtesyFormError({ ...form, lastDay: "" }, TODAY)?.field).toBe("lastDay");
  });

  it("asks for the reason", () => {
    expect(courtesyFormError({ ...form, reason: "  ok " }, TODAY)).toEqual({
      field: "reason",
      message: "Escreva o motivo, com pelo menos 5 letras.",
    });
  });

  it("names the last whole day the plan is valid, in Brasília", () => {
    expect(courtesyEndText("2027-03-01T03:00:00.000Z")).toBe("Até 28/02/2027");
    expect(courtesyEndText(null)).toBe("Sem data para acabar");
  });
});

describe("courtesy in the team's trail", () => {
  const details = {
    plan: "elite",
    expiresAt: "2027-03-01T03:00:00.000Z",
    reason: "Conta do cliente",
    renewalStopped: false,
    previousPlan: null,
  };

  it("says which plan was given, until when and why", () => {
    expect(describeAdminEvent("courtesy_granted", details)).toBe(
      "Concedeu o plano Elite sem cobrança, até 28/02/2027. Motivo: Conta do cliente",
    );
  });

  it("says when the paid subscription stopped renewing", () => {
    const text = describeAdminEvent("courtesy_granted", { ...details, renewalStopped: true });

    expect(text).toContain("A assinatura paga parou de renovar");
  });

  it("words a change and a plan with no end", () => {
    expect(describeAdminEvent("courtesy_changed", { ...details, expiresAt: null })).toBe(
      "Mudou a cortesia para o plano Elite sem cobrança, sem data para acabar. Motivo: Conta do cliente",
    );
  });

  it("says which plan was taken back and why", () => {
    expect(describeAdminEvent("courtesy_revoked", { plan: "pro", reason: "Passou a pagar" })).toBe(
      "Retirou o plano Pro sem cobrança. Motivo: Passou a pagar",
    );
  });
});

describe("courtesy ending in the team's queue", () => {
  it("counts the days left and says what to do", () => {
    const issue = { kind: "courtesy" as const, expiresAt: new Date(), daysLeft: 3 };

    expect(describeIssue(issue)).toEqual({
      title: "Plano sem cobrança acaba em 3 dias",
      description:
        "Mude a data para renovar. Depois do fim, valem as regras de quem não tem plano.",
      badge: "Cortesia acaba em 3 dias",
    });
    expect(describeIssue({ ...issue, daysLeft: 1 }).title).toBe("Plano sem cobrança acaba amanhã");
    expect(describeIssue({ ...issue, daysLeft: 0 }).badge).toBe("Cortesia acaba hoje");
  });
});
