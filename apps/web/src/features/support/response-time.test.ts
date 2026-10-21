import { describe, expect, it } from "vitest";
import {
  formatDeadline,
  formatDuration,
  RESPONSE_PROMISE,
  staffResponseStateText,
  unreadRepliesText,
} from "./response-time";

describe("formatDuration", () => {
  it("rounds to minutes, hours or days", () => {
    expect(formatDuration(10_000)).toBe("1 min");
    expect(formatDuration(40 * 60_000)).toBe("40 min");
    expect(formatDuration(3 * 3_600_000)).toBe("3 h");
    expect(formatDuration(47 * 3_600_000)).toBe("47 h");
    expect(formatDuration(72 * 3_600_000)).toBe("3 dias");
  });

  it("never shows more time left than there is when rounding down", () => {
    const oneHourThirtyOne = 91 * 60_000;
    expect(formatDuration(oneHourThirtyOne, Math.floor)).toBe("1 h");
    expect(formatDuration(59.9 * 60_000, Math.floor)).toBe("59 min");
    expect(formatDuration(10_000, Math.floor)).toBe("1 min");
  });
});

describe("staffResponseStateText", () => {
  it("leaves the live deadline to tickets with a clock running", () => {
    expect(staffResponseStateText("open", new Date())).toBeNull();
  });

  it("does not contradict an open badge after a reply that kept the ticket open", () => {
    expect(staffResponseStateText("open", null)).toBe(
      "Sem prazo: o cliente já recebeu uma resposta",
    );
  });

  it("names who the ticket waits for otherwise", () => {
    expect(staffResponseStateText("answered", null)).toBe("Aguardando o revendedor");
    expect(staffResponseStateText("closed", null)).toBe("Encerrado");
  });
});

describe("formatDeadline", () => {
  const now = new Date("2026-10-12T15:00:00Z"); // 12:00 in Brasília

  it("says today or tomorrow in Brasília time, and the date after that", () => {
    expect(formatDeadline(new Date("2026-10-12T20:30:00Z"), now)).toBe("hoje às 17:30");
    expect(formatDeadline(new Date("2026-10-13T12:00:00Z"), now)).toBe("amanhã às 09:00");
    expect(formatDeadline(new Date("2026-10-15T12:00:00Z"), now)).toBe("15/10 às 09:00");
  });

  it("uses the Brasília calendar day, not UTC", () => {
    // 01:00 UTC on the 13th is still 22:00 on the 12th in Brasília.
    expect(formatDeadline(new Date("2026-10-13T01:00:00Z"), now)).toBe("hoje às 22:00");
  });
});

describe("RESPONSE_PROMISE", () => {
  it("promises business days, never an hour that may pass overnight", () => {
    expect(RESPONSE_PROMISE).toBe("Respondemos em até 1 dia útil");
  });
});

describe("unreadRepliesText", () => {
  it("counts tickets with the right plural", () => {
    expect(unreadRepliesText(1)).toBe("1 chamado com resposta nova");
    expect(unreadRepliesText(3)).toBe("3 chamados com resposta nova");
  });
});
