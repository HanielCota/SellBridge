import { describe, expect, it } from "vitest";
import {
  remainingSetupMinutes,
  SETUP_STEPS,
  setupEtaLabel,
  setupPercent,
  type SetupProgress,
} from "./setup-progress";

const NOTHING_DONE: SetupProgress = {
  hasHolder: false,
  hasSupplier: false,
  hasStore: false,
  hasPublishedListing: false,
};

const ALL_DONE: SetupProgress = {
  hasHolder: true,
  hasSupplier: true,
  hasStore: true,
  hasPublishedListing: true,
};

// Item 26.c (I1–I4): the setup shows how far along it is and how long is left.
describe("setup progress", () => {
  it("estimates every step", () => {
    for (const step of SETUP_STEPS) {
      expect(step.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it("measures the share of steps done", () => {
    expect(setupPercent(NOTHING_DONE)).toBe(0);
    expect(setupPercent({ ...NOTHING_DONE, hasHolder: true })).toBe(25);
    expect(setupPercent(ALL_DONE)).toBe(100);
  });

  it("adds up the minutes of the steps still pending", () => {
    expect(remainingSetupMinutes(NOTHING_DONE)).toBe(11);
    expect(remainingSetupMinutes({ ...NOTHING_DONE, hasHolder: true, hasSupplier: true })).toBe(8);
    expect(remainingSetupMinutes(ALL_DONE)).toBe(0);
  });

  it("tells when the store is ready, and nothing once it is", () => {
    expect(setupEtaLabel(NOTHING_DONE)).toBe("Sua loja fica pronta em ~11 min");
    expect(setupEtaLabel(ALL_DONE)).toBeNull();
  });
});
