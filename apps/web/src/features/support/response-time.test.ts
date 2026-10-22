import { describe, expect, it } from "vitest";
import {
  formatDeadline,
  formatDuration,
  outOfHoursNotice,
  supportHoursText,
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

describe("supportHoursText", () => {
  const hours = "Atendimento todos os dias, das 8h às 18h (horário de Brasília).";

  it("states the hours alone while the team is at work", () => {
    expect(supportHoursText(new Date("2026-10-21T08:00:00-03:00"))).toBe(hours);
    expect(supportHoursText(new Date("2026-10-21T17:59:00-03:00"))).toBe(hours);
  });

  it("adds when the answers start again outside the hours", () => {
    const outside = `${hours} Estamos fora do horário. Respondemos a partir das 8h.`;
    expect(supportHoursText(new Date("2026-10-21T07:59:00-03:00"))).toBe(outside);
    expect(supportHoursText(new Date("2026-10-21T18:00:00-03:00"))).toBe(outside);
  });

  it("reads the Brasília clock, not UTC", () => {
    // 22:00 UTC is 19:00 in Brasília: closed, though UTC hours alone could not tell.
    expect(supportHoursText(new Date("2026-10-21T22:00:00Z"))).toContain("fora do horário");
  });
});

describe("outOfHoursNotice", () => {
  it("has nothing to add while the team is at work", () => {
    expect(outOfHoursNotice(new Date("2026-10-24T10:00:00-03:00"))).toBeNull();
  });

  it("says when answers start again, on its own, outside the hours", () => {
    expect(outOfHoursNotice(new Date("2026-10-24T18:00:00-03:00"))).toBe(
      "Estamos fora do horário. Respondemos a partir das 8h.",
    );
  });
});

describe("unreadRepliesText", () => {
  it("counts tickets with the right plural", () => {
    expect(unreadRepliesText(1)).toBe("1 chamado com resposta nova");
    expect(unreadRepliesText(3)).toBe("3 chamados com resposta nova");
  });
});
