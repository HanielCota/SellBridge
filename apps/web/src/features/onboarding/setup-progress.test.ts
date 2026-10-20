import { describe, expect, it } from "vitest";
import {
  findNextStep,
  getSetupSteps,
  PUBLISHING_POLL_MILLISECONDS,
  remainingSetupMinutes,
  SETUP_STEPS,
  setupEtaLabel,
  setupPercent,
  setupProgressRefetchInterval,
  type SetupProgress,
} from "./setup-progress";

const NOTHING_DONE: SetupProgress = {
  hasHolder: false,
  hasSupplier: false,
  hasVerifiedEmail: false,
  hasStore: false,
  hasPublishedListing: false,
};

const ALL_DONE: SetupProgress = {
  hasHolder: true,
  hasSupplier: true,
  hasVerifiedEmail: true,
  hasStore: true,
  hasPublishedListing: true,
};

// Item 26.c (I1–I4): the setup shows how far along it is and how long is left.
describe("setup progress", () => {
  it("opens the private product panel for own-only sellers", () => {
    const progress = { ...ALL_DONE, hasPublishedListing: false, productSourceMode: "own" as const };
    expect(findNextStep(progress)?.to).toBe("/products");
    expect(getSetupSteps(progress).find((step) => step.key === "hasPublishedListing")?.cta).toBe(
      "Open my products",
    );
    expect(findNextStep({ ...progress, productSourceMode: "both" })?.to).toBe("/catalogo");
  });
  it("estimates every step", () => {
    for (const step of SETUP_STEPS) {
      expect(step.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it("measures the share of steps done", () => {
    expect(setupPercent(NOTHING_DONE)).toBe(0);
    expect(setupPercent({ ...NOTHING_DONE, hasHolder: true })).toBe(20);
    expect(setupPercent(ALL_DONE)).toBe(100);
  });

  it("adds up the minutes of the steps still pending", () => {
    expect(remainingSetupMinutes(NOTHING_DONE)).toBe(12);
    expect(remainingSetupMinutes({ ...NOTHING_DONE, hasHolder: true, hasSupplier: true })).toBe(9);
    expect(remainingSetupMinutes(ALL_DONE)).toBe(0);
  });

  it("tells when the store is ready, and nothing once it is", () => {
    expect(setupEtaLabel(NOTHING_DONE)).toBe("Sua loja fica pronta em ~12 min");
    expect(setupEtaLabel(ALL_DONE)).toBeNull();
  });
});

// Item 26.b (L1): connecting a store waits for the confirmed e-mail, so the step comes first.
describe("e-mail step", () => {
  it("asks to confirm the e-mail right before connecting a store", () => {
    const keys = SETUP_STEPS.map((step) => step.key);
    expect(keys.indexOf("hasVerifiedEmail")).toBe(keys.indexOf("hasStore") - 1);
    expect(findNextStep({ ...NOTHING_DONE, hasHolder: true, hasSupplier: true })?.title).toBe(
      "Confirme seu e-mail",
    );
  });
});

// Publishing only queues the job: the strip kept "publique produtos" after the product went live.
describe("setup progress refresh", () => {
  const publishing = { ...ALL_DONE, hasPublishedListing: false, isPublishing: true };

  it("re-reads the progress while the first publication is on its way", () => {
    expect(setupProgressRefetchInterval(publishing)).toBe(PUBLISHING_POLL_MILLISECONDS);
  });

  it("stops once the publication is confirmed", () => {
    expect(setupProgressRefetchInterval({ ...publishing, hasPublishedListing: true })).toBe(false);
  });

  it("does not poll when nothing is publishing or nothing was read yet", () => {
    expect(setupProgressRefetchInterval({ ...publishing, isPublishing: false })).toBe(false);
    expect(setupProgressRefetchInterval(undefined)).toBe(false);
  });
});
