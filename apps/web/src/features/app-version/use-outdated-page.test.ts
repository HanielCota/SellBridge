import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { BuildStamp } from "./app-version";
import { checkServedBuildNow, VERSION_QUERY_KEY } from "./use-outdated-page";

const SERVED = { buildId: "served-build", builtAt: "2026-11-05T12:00:00.000Z" };

describe("checkServedBuildNow", () => {
  it("asks the server once for a burst of failed calls", async () => {
    const queryClient = new QueryClient();
    let resolveAnswer: ((build: BuildStamp | null) => void) | undefined;
    const pendingAnswer = new Promise<BuildStamp | null>((resolve) => {
      resolveAnswer = resolve;
    });
    const fetchServedBuild = vi
      .fn<() => Promise<BuildStamp | null>>()
      .mockResolvedValueOnce(SERVED);
    await queryClient.fetchQuery({ queryKey: VERSION_QUERY_KEY, queryFn: fetchServedBuild });
    fetchServedBuild.mockReturnValue(pendingAnswer);

    const checks = [
      checkServedBuildNow(queryClient),
      checkServedBuildNow(queryClient),
      checkServedBuildNow(queryClient),
    ];
    resolveAnswer?.(SERVED);
    await Promise.all(checks);

    expect(fetchServedBuild).toHaveBeenCalledTimes(2);
  });
});
