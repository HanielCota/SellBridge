import { logger } from "@sellbridge/shared/logger";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createShopeeRejectionAlert,
  SHOPEE_REJECTION_ALERT_THRESHOLD,
  SHOPEE_REJECTION_WINDOW_IN_MS,
} from "./rejection-alert";

const CALLBACK = "https://sellbridge.test/api/webhooks/shopee";

function reject(record: (url: string) => void, times: number) {
  for (let index = 0; index < times; index += 1) {
    record(CALLBACK);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createShopeeRejectionAlert", () => {
  it("reports once when many Shopee pushes are refused within an hour", () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const record = createShopeeRejectionAlert(() => 0);

    reject(record, SHOPEE_REJECTION_ALERT_THRESHOLD * 2);

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      "webhook.shopee_rejections",
      expect.objectContaining({ problemKey: "webhook-rejected:shopee" }),
    );
    expect(JSON.stringify(error.mock.calls[0])).toContain(CALLBACK);
  });

  it("stays quiet below the threshold", () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const record = createShopeeRejectionAlert(() => 0);

    reject(record, SHOPEE_REJECTION_ALERT_THRESHOLD - 1);

    expect(error).not.toHaveBeenCalled();
  });

  it("starts counting again after the window", () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    let nowInMs = 0;
    const record = createShopeeRejectionAlert(() => nowInMs);
    reject(record, SHOPEE_REJECTION_ALERT_THRESHOLD - 1);

    nowInMs = SHOPEE_REJECTION_WINDOW_IN_MS;
    reject(record, SHOPEE_REJECTION_ALERT_THRESHOLD - 1);

    expect(error).not.toHaveBeenCalled();
  });
});
