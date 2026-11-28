import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { setupGuideInitScript, setupGuideView, setupStripMode } from "./setup-guide-visibility";

describe("setupGuideView", () => {
  it("opens the whole guide while the setup is not done and nothing was chosen", () => {
    const view = setupGuideView(false, "shown");

    expect(view).toBe("open");
  });

  it("minimizes the guide to the strip when this browser chose it", () => {
    const view = setupGuideView(false, "hidden");

    expect(view).toBe("collapsed");
  });

  it("keeps both versions for the CSS to pick while the choice is still unknown", () => {
    const view = setupGuideView(false, "unknown");

    expect(view).toBe("pending");
  });

  it("shows nothing once the setup is done, whatever was chosen", () => {
    const views = (["shown", "hidden", "unknown"] as const).map((choice) =>
      setupGuideView(true, choice),
    );

    expect(views).toEqual(["none", "none", "none"]);
  });
});

function runInitScript(storage: Pick<Storage, "getItem">): Record<string, string> {
  const dataset: Record<string, string> = {};
  runInNewContext(setupGuideInitScript, {
    localStorage: storage,
    document: { documentElement: { dataset } },
  });
  return dataset;
}

describe("setupGuideInitScript", () => {
  it("marks the page before hydration when the guide was minimized", () => {
    const dataset = runInitScript({ getItem: () => "hidden" });

    expect(dataset).toEqual({ setupGuide: "hidden" });
  });

  it("leaves the page unmarked when nothing was saved", () => {
    const dataset = runInitScript({ getItem: () => null });

    expect(dataset).toEqual({});
  });

  it("leaves the page unmarked when storage is blocked", () => {
    const dataset = runInitScript({
      getItem: () => {
        throw new Error("storage blocked");
      },
    });

    expect(dataset).toEqual({});
  });
});

describe("setupStripMode", () => {
  it("keeps the progress on the details and supplier steps of the setup flow", () => {
    expect(
      setupStripMode({
        pathname: "/onboarding",
        inSetupFlow: true,
        nextStep: { key: "hasHolder", to: "/onboarding" },
      }),
    ).toBe("current");
  });

  it("hides the strip on the profile page opened outside the setup flow", () => {
    expect(
      setupStripMode({
        pathname: "/onboarding",
        inSetupFlow: false,
        nextStep: { key: "hasHolder", to: "/onboarding" },
      }),
    ).toBe("hidden");
  });

  it("shows the progress without a button on the page of the next step", () => {
    expect(
      setupStripMode({
        pathname: "/lojas",
        inSetupFlow: false,
        nextStep: { key: "hasStore", to: "/lojas" },
      }),
    ).toBe("current");
  });

  it("points at the next step from any other store page", () => {
    expect(
      setupStripMode({
        pathname: "/pedidos",
        inSetupFlow: false,
        nextStep: { key: "hasPublishedListing", to: "/catalogo" },
      }),
    ).toBe("next");
  });

  it("hides the strip once the setup is done", () => {
    expect(setupStripMode({ pathname: "/pedidos", inSetupFlow: false, nextStep: undefined })).toBe(
      "hidden",
    );
  });

  it("keeps the dashboard to its own guide", () => {
    expect(
      setupStripMode({
        pathname: "/dashboard",
        inSetupFlow: true,
        nextStep: { key: "hasStore", to: "/lojas" },
      }),
    ).toBe("hidden");
  });

  it("hides the strip on an onboarding step opened before its turn in the setup flow", () => {
    expect(
      setupStripMode({
        pathname: "/onboarding",
        inSetupFlow: true,
        nextStep: { key: "hasStore", to: "/lojas" },
        openStep: "details",
      }),
    ).toBe("hidden");
    expect(
      setupStripMode({
        pathname: "/onboarding",
        inSetupFlow: true,
        nextStep: { key: "hasHolder", to: "/onboarding" },
        openStep: "supplier",
      }),
    ).toBe("hidden");
  });

  it("keeps the progress on the onboarding step that is next in the setup flow", () => {
    expect(
      setupStripMode({
        pathname: "/onboarding",
        inSetupFlow: true,
        nextStep: { key: "hasSupplier", to: "/onboarding" },
        openStep: "supplier",
      }),
    ).toBe("current");
  });
});
