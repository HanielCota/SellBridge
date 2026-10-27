import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeactivationConfirm } from "./apply-flag-parts";

const MISSING_CONFIRMATION = "Marque a confirmação para desligar o fornecedor.";

function render(error: string | undefined): string {
  return renderToStaticMarkup(
    <DeactivationConfirm
      activeCount={2}
      confirmed={false}
      error={error}
      onConfirmedChange={() => undefined}
    />,
  );
}

/** The opening tag of the checkbox, as the static markup renders it. */
function checkboxTag(markup: string): string {
  return /<button[^>]*role="checkbox"[^>]*>/.exec(markup)?.[0] ?? "";
}

describe("the 3rd-flag confirmation", () => {
  it("reads the missing-confirmation message as the checkbox's description", () => {
    const markup = render(MISSING_CONFIRMATION);
    const describedBy = /aria-describedby="([^"]+)"/.exec(checkboxTag(markup))?.[1] ?? null;

    expect(describedBy).not.toBeNull();
    expect(markup).toContain(`id="${describedBy ?? ""}"`);
    expect(markup).toMatch(new RegExp(`id="${describedBy ?? ""}"[^>]*>${MISSING_CONFIRMATION}<`));
  });

  it("describes nothing before the team member tries to apply", () => {
    expect(checkboxTag(render(undefined))).not.toBe("");
    expect(checkboxTag(render(undefined))).not.toContain("aria-describedby");
  });
});
