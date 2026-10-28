import { describe, expect, it } from "vitest";
import {
  ACCEPT_DAY_CHOICES,
  DISPATCH_DAY_CHOICES,
  deadlineExample,
  deadlineLabel,
  deadlineOptions,
  dispatchAfterAccept,
} from "./brand-deadlines";

describe("deadlineLabel", () => {
  it("reads whole days in days and anything else in hours", () => {
    expect(deadlineLabel(24)).toBe("1 dia");
    expect(deadlineLabel(120)).toBe("5 dias");
    expect(deadlineLabel(12)).toBe("12 horas");
    expect(deadlineLabel(1)).toBe("1 hora");
  });
});

describe("deadlineOptions", () => {
  it("offers the day choices as hours", () => {
    expect(deadlineOptions(ACCEPT_DAY_CHOICES, 24)).toEqual(["24", "48", "72"]);
  });

  it("keeps a deadline the team set by hand as its own option", () => {
    expect(deadlineOptions(ACCEPT_DAY_CHOICES, 12)).toEqual(["12", "24", "48", "72"]);
  });

  it("leaves out dispatch options earlier than the accept deadline", () => {
    expect(deadlineOptions(DISPATCH_DAY_CHOICES, 72, 72)).toEqual(["72", "120"]);
  });
});

describe("dispatchAfterAccept", () => {
  it("moves dispatch up when accept passes it and keeps it otherwise", () => {
    expect(dispatchAfterAccept(72, 48)).toBe(72);
    expect(dispatchAfterAccept(24, 48)).toBe(48);
  });
});

describe("deadlineExample", () => {
  it("moves into the next week when an odd-hour deadline crosses Sunday midnight", () => {
    expect(deadlineExample(12, 158)).toBe(
      "Exemplo: pedido encaminhado na segunda às 10h → aceitar até segunda às 22h e despachar até segunda da semana seguinte às 0h.",
    );
  });

  it("keeps the week offset of a valid thirty-day deadline", () => {
    expect(deadlineExample(24, 720)).toBe(
      "Exemplo: pedido encaminhado na segunda às 10h → aceitar até terça às 10h e despachar até quarta daqui a 4 semanas às 10h.",
    );
  });

  it("counts both deadlines from Monday at 10h", () => {
    expect(deadlineExample(24, 48)).toBe(
      "Exemplo: pedido encaminhado na segunda às 10h → aceitar até terça às 10h e despachar até quarta às 10h.",
    );
  });

  it("names the next week and odd hours when the deadline needs them", () => {
    expect(deadlineExample(12, 168)).toBe(
      "Exemplo: pedido encaminhado na segunda às 10h → aceitar até segunda às 22h e despachar até segunda da semana seguinte às 10h.",
    );
  });
});
