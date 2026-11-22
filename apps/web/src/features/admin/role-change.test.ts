import { describe, expect, it } from "vitest";
import { roleChangeConfirmation, roleChangedMessage } from "./role-change";

describe("roleChangeConfirmation", () => {
  it("asks before making a reseller an administrator, saying what they will see", () => {
    const confirmation = roleChangeConfirmation({
      name: "Daniel Souza",
      from: "user",
      to: "admin",
    });

    expect(confirmation?.title).toBe("Tornar Daniel Souza Administrador?");
    expect(confirmation?.description).toContain("os pagamentos, a taxa e as configurações");
    expect(confirmation?.confirmLabel).toBe("Tornar Administrador");
  });

  it("asks before raising an agent to supervisor", () => {
    const confirmation = roleChangeConfirmation({
      name: "Daniel Souza",
      from: "agent",
      to: "supervisor",
    });

    expect(confirmation?.confirmLabel).toBe("Tornar Supervisor");
  });

  it("takes access away without asking", () => {
    const confirmation = roleChangeConfirmation({
      name: "Daniel Souza",
      from: "admin",
      to: "user",
    });

    expect(confirmation).toBeNull();
  });

  it("lowers an administrator to agent without asking", () => {
    const confirmation = roleChangeConfirmation({
      name: "Daniel Souza",
      from: "admin",
      to: "agent",
    });

    expect(confirmation).toBeNull();
  });
});

describe("roleChangedMessage", () => {
  it("names the person and the new role", () => {
    expect(roleChangedMessage("Daniel Souza", "admin")).toBe("Daniel Souza agora é Administrador");
  });
});
