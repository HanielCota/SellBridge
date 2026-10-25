import type {
  AgentPerformance,
  SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { describe, expect, it } from "vitest";
import {
  bucketTitle,
  changeCopy,
  formatAxisMinutes,
  standingCopy,
  subjectFullLabel,
  subjectLabel,
  subjectQueueSearch,
  tenureText,
} from "./performance-format";
import { attentionCopy, boardStory, personStory } from "./performance-story";

function text(segments: readonly { text: string }[]): string {
  return segments.map((segment) => segment.text).join("");
}

function report(
  overrides: Partial<SupportPerformanceReport["overview"]> = {},
  attention: SupportPerformanceReport["attention"] = [],
) {
  const rate = { value: null, sample: 0 };
  const overview: SupportPerformanceReport["overview"] = {
    opened: { current: 150, previous: 120 },
    resolved: { current: 128, previous: 117 },
    firstResponseMinutes: { current: 58, previous: 72 },
    onTime: rate,
    noReopen: rate,
    previousNoReopen: rate,
    rating: rate,
    previousRating: rate,
    ratingRate: null,
    resolvedPerAgent: null,
    ...overrides,
  };
  const full: SupportPerformanceReport = {
    days: 30,
    origin: "todos",
    since: "2026-09-24T15:00:00.000Z",
    until: "2026-10-24T15:00:00.000Z",
    bucket: "week",
    overview,
    queue: { open: 0, waiting: 0, overdue: 0, unassigned: 0 },
    series: [],
    heatmap: [],
    subjects: [],
    team: [],
    attention,
  };
  return full;
}

const BASE_AGENT: AgentPerformance = {
  id: "ana",
  name: "Ana Ribeiro",
  role: "agent",
  joinedAt: "2026-10-02T12:00:00.000Z",
  onProbation: true,
  standing: "on_par",
  resolved: { current: 10, previous: 4 },
  activeDays: 5,
  resolvedPerActiveDay: 2,
  firstResponseMinutes: 40,
  onTime: { value: 0.9, sample: 10 },
  noReopen: { value: 0.9, sample: 10 },
  expectedNoReopen: 0.9,
  rating: { value: 4.5, sample: 4 },
  openNow: 2,
  overdueNow: 0,
  oldestAwaitingMinutes: null,
  lastReplyAt: null,
  resolvedSeries: [],
  subjects: [],
  lowRatings: [],
};

describe("subjectLabel", () => {
  it("names the situation the customer picked", () => {
    expect(subjectLabel({ origin: "seller", category: "order", situationId: "order-late" })).toBe(
      "O pedido atrasou",
    );
  });

  it("calls tickets from before the guided form 'Sem detalhe'", () => {
    expect(subjectLabel({ origin: "seller", category: "order", situationId: null })).toBe(
      "Sem detalhe",
    );
  });

  it("uses the topic for topics without situations", () => {
    expect(subjectLabel({ origin: "seller", category: "other", situationId: null })).toBe(
      "Outra coisa",
    );
  });
});

describe("changeCopy", () => {
  it("paints a shorter first response as good news though it goes down", () => {
    expect(changeCopy({ current: 58, previous: 72, kind: "minutes", lowerIsBetter: true })).toEqual(
      {
        direction: "down",
        label: "14 min",
        good: true,
      },
    );
  });

  it("reads rates in percentage points and ignores tiny moves", () => {
    expect(changeCopy({ current: 0.91, previous: 0.89, kind: "rate" })?.label).toBe("2 p.p.");
    expect(changeCopy({ current: 0.9, previous: 0.902, kind: "rate" })?.direction).toBe("flat");
  });

  it("says nothing without a previous figure", () => {
    expect(changeCopy({ current: 3, previous: null, kind: "count" })).toBeNull();
  });
});

describe("axis and tenure", () => {
  it("keeps axis ticks short", () => {
    expect(formatAxisMinutes(0)).toBe("0");
    expect(formatAxisMinutes(30)).toBe("30 min");
    expect(formatAxisMinutes(90)).toBe("1,5 h");
  });

  it("marks new team members as on probation with their start date", () => {
    expect(tenureText(BASE_AGENT)).toBe("entrou em 02/10 · em experiência");
  });
});

describe("standingCopy", () => {
  it("counts the late tickets in the word itself", () => {
    expect(standingCopy({ standing: "overdue", overdueNow: 2 })).toEqual({
      text: "2 fora do prazo",
      tone: "danger",
    });
  });
});

describe("boardStory", () => {
  it("says whether the team kept up with what came in", () => {
    const story = text(boardStory(report()));
    expect(story).toBe("128 chamados resolvidos, 9% a mais. Entraram 150: a fila cresceu 22.");
  });

  it("names the subject that rose the most", () => {
    const rising = report({}, [
      {
        kind: "rising_subject",
        subject: { origin: "seller", category: "store", situationId: "store-disconnected" },
        current: 10,
        previous: 3,
      },
    ]);
    expect(text(boardStory(rising))).toContain("O que mais cresceu: “A loja desligou”.");
  });

  it("says so when nothing happened", () => {
    const empty = report({
      opened: { current: 0, previous: 0 },
      resolved: { current: 0, previous: 0 },
    });
    expect(text(boardStory(empty))).toBe("Nenhum chamado no período.");
  });
});

describe("personStory", () => {
  it("points at the subject where the person keeps fewer tickets solved than the team", () => {
    const agent: AgentPerformance = {
      ...BASE_AGENT,
      subjects: [
        {
          origin: "seller",
          category: "order",
          situationId: "order-late",
          resolved: 6,
          noReopen: { value: 0.67, sample: 6 },
          teamNoReopen: { value: 0.88, sample: 20 },
        },
      ],
    };
    expect(text(personStory(agent))).toBe("Precisa de treino em “O pedido atrasou”.");
  });

  it("does not judge someone with too few resolutions", () => {
    expect(text(personStory({ ...BASE_AGENT, standing: "too_few" }))).toContain("Poucos chamados");
  });
});

describe("attentionCopy", () => {
  it("opens the overdue queue from the late tickets item", () => {
    const copy = attentionCopy(
      { kind: "overdue", count: 3, oldestAwaitingMinutes: 570 },
      { days: 30, origin: "todos" },
    );
    expect(copy.title).toBe("3 chamados fora do prazo");
    expect(copy.link).toEqual({ to: "/admin/chamados", search: { queue: "overdue" } });
  });

  it("opens the person's sheet from the needs-support item", () => {
    const copy = attentionCopy(
      {
        kind: "needs_support",
        agentId: "camila",
        name: "Camila",
        onTime: { value: 0.71, sample: 17 },
        noReopen: { value: 0.82, sample: 17 },
      },
      { days: 7, origin: "fornecedor" },
    );
    expect(copy.description).toBe("71% no prazo · 82% sem reabrir");
    // The sheet opens on the same period and customers that flagged the person.
    expect(copy.link).toEqual({
      to: "/admin/chamados/metricas",
      search: { pessoa: "camila", days: 7, origem: "fornecedor" },
    });
  });
});

describe("subjectFullLabel", () => {
  it("keeps the topic beside vague subjects so two 'Outro problema' read apart", () => {
    expect(
      subjectFullLabel({ origin: "seller", category: "listing", situationId: "other-issue" }),
    ).toBe("Meus anúncios · outro problema");
    expect(
      subjectFullLabel({ origin: "seller", category: "order", situationId: "order-late" }),
    ).toBe("O pedido atrasou");
  });
});

describe("review findings (2026-10-25)", () => {
  it("does not prescribe training over a single ticket that came back", () => {
    const agent: AgentPerformance = {
      ...BASE_AGENT,
      subjects: [
        {
          origin: "seller",
          category: "order",
          situationId: "order-late",
          resolved: 19,
          noReopen: { value: 1, sample: 19 },
          teamNoReopen: { value: 0.9, sample: 40 },
        },
        {
          origin: "seller",
          category: "store",
          situationId: "store-disconnected",
          resolved: 1,
          noReopen: { value: 0, sample: 1 },
          teamNoReopen: { value: 0.9, sample: 30 },
        },
      ],
    };
    expect(text(personStory(agent))).toBe("Vai bem em “O pedido atrasou”.");
  });

  it("opens the queue on the exact subject, customer kind and 'sem detalhe'", () => {
    expect(
      subjectQueueSearch({ origin: "supplier", category: "payment", situationId: "invoice" }),
    ).toEqual({
      category: "payment",
      situacao: "invoice",
      origem: "fornecedor",
    });
    expect(subjectQueueSearch({ origin: "seller", category: "order", situationId: null })).toEqual({
      category: "order",
      situacao: "sem-detalhe",
      origem: "revendedor",
    });
  });

  it("names the day and its date in a daily tooltip", () => {
    expect(bucketTitle("2026-10-24", "day")).toBe("sáb, 24/10");
    expect(bucketTitle("2026-10-20", "week")).toBe("Semana de 20/10");
  });

  it("shows a count change from zero as a whole number", () => {
    expect(changeCopy({ current: 5, previous: 0, kind: "count" })?.label).toBe("5");
  });
});
