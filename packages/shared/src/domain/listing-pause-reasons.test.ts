import { describe, expect, it } from "vitest";
import {
  LISTING_PAUSE_REASON_LABELS,
  LISTING_PAUSE_REASONS,
  readListingPauseReason,
  resumesOnReconnection,
} from "./listing-pause-reasons.ts";

describe("readListingPauseReason", () => {
  it("reads a known reason", () => {
    const result = readListingPauseReason("store_disconnected");

    expect(result).toBe("store_disconnected");
  });

  it.each([null, undefined, "", "cost_went_up_next_year"])("returns null for %j", (value) => {
    const result = readListingPauseReason(value);

    expect(result).toBeNull();
  });
});

describe("resumesOnReconnection", () => {
  it("resumes only what the disconnection paused", () => {
    const resumed = LISTING_PAUSE_REASONS.filter(resumesOnReconnection);

    expect(resumed).toEqual(["store_disconnected"]);
  });

  it("keeps a listing without a known reason paused", () => {
    const result = resumesOnReconnection(null);

    expect(result).toBe(false);
  });
});

describe("LISTING_PAUSE_REASON_LABELS", () => {
  it("words every reason in Portuguese", () => {
    const labels = LISTING_PAUSE_REASONS.map((reason) => LISTING_PAUSE_REASON_LABELS[reason]);

    expect(labels.every((label) => label.startsWith("Pausado"))).toBe(true);
  });
});
