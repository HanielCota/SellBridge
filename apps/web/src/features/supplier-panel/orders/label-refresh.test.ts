import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LABEL_REFRESH_DELAY_IN_MS, refreshAfterLabel } from "./label-refresh";

const ordersKey = ["supplier-panel", "orders", "supplier-1"];
const detailKey = [...ordersKey, "detail", "shipment-1"];

function clientWithOpenOrder() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(detailKey, { labelState: "pending" });
  return queryClient;
}

describe("refreshAfterLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks the open order stale as soon as the label is requested", () => {
    const queryClient = clientWithOpenOrder();

    refreshAfterLabel(queryClient, ordersKey);

    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  it("reloads the orders again once the label had time to be recorded", () => {
    const queryClient = clientWithOpenOrder();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    refreshAfterLabel(queryClient, ordersKey);
    vi.advanceTimersByTime(LABEL_REFRESH_DELAY_IN_MS);

    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: ordersKey });
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("skips the later reload when the screen closed first", () => {
    const queryClient = clientWithOpenOrder();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const cancel = refreshAfterLabel(queryClient, ordersKey);
    cancel();
    vi.advanceTimersByTime(LABEL_REFRESH_DELAY_IN_MS);

    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
