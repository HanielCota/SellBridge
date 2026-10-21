import { describe, expect, it } from "vitest";
import { customerTicketState, type CustomerTicketFacts } from "./customer-ticket-state";

const HOUR = 3_600_000;
const NOW = new Date("2026-10-21T15:00:00Z");

function facts(overrides: Partial<CustomerTicketFacts>): CustomerTicketFacts {
  return {
    status: "open",
    priority: "normal",
    awaitingSince: new Date(NOW.getTime() - HOUR),
    updatedAt: new Date(NOW.getTime() - HOUR),
    closedAutomatically: false,
    emailsOn: true,
    ...overrides,
  };
}

describe("customerTicketState", () => {
  it("promises one business day, never an hour, while support is within its target", () => {
    const state = customerTicketState(facts({}), NOW);
    expect(state).toEqual({
      tone: "waiting",
      headline: "Esperando o suporte",
      detail: "Respondemos em até 1 dia útil. A resposta chega aqui e por e-mail.",
    });
  });

  it("only promises the e-mail when the customer gets it", () => {
    const state = customerTicketState(facts({ emailsOn: false }), NOW);
    expect(state.detail).toBe("Respondemos em até 1 dia útil.");
  });

  it("admits the delay instead of showing a deadline that already passed", () => {
    const state = customerTicketState(
      facts({ awaitingSince: new Date(NOW.getTime() - 30 * HOUR) }),
      NOW,
    );
    expect(state.tone).toBe("late");
    expect(state.detail).toBe("Está demorando mais que o normal. Seu chamado continua na fila.");
    expect(state.detail).not.toMatch(/\d{2}:\d{2}/);
  });

  it("asks for a verdict and warns the day the answered ticket closes on its own", () => {
    const state = customerTicketState(
      facts({ status: "answered", awaitingSince: null, updatedAt: NOW }),
      NOW,
    );
    expect(state).toEqual({
      tone: "answered",
      headline: "O suporte respondeu",
      detail: "Leia a resposta e diga se resolveu. Sem resposta até 28/10, encerramos.",
    });
  });

  it("explains a close made by the idle job and how to reopen", () => {
    const state = customerTicketState(
      facts({ status: "closed", awaitingSince: null, closedAutomatically: true }),
      NOW,
    );
    expect(state.headline).toBe("Encerrado por falta de resposta");
    expect(state.detail).toBe("Ficou 7 dias sem resposta sua. Escreva abaixo para reabrir.");
  });

  it("tells a closed ticket reopens when the customer writes", () => {
    const state = customerTicketState(facts({ status: "closed", awaitingSince: null }), NOW);
    expect(state).toEqual({
      tone: "closed",
      headline: "Encerrado",
      detail: "Precisa de mais alguma coisa? Escreva abaixo e o chamado reabre.",
    });
  });
});
