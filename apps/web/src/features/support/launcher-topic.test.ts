import { describe, expect, it } from "vitest";
import { launcherTopic } from "./launcher-topic";

describe("launcherTopic", () => {
  it("opens the money topic from the pages about money", () => {
    expect(launcherTopic("/financeiro")).toBe("payment");
    expect(launcherTopic("/assinatura")).toBe("payment");
  });

  it("starts at step 1 anywhere else, without matching look-alike paths", () => {
    expect(launcherTopic("/dashboard")).toBeUndefined();
    expect(launcherTopic("/pedidos")).toBeUndefined();
    expect(launcherTopic("/financeiro-antigo")).toBeUndefined();
  });
});
