import { expect, test, type Locator } from "@playwright/test";
import { gotoHydrated } from "./helpers";

/** The cursor is as tall as the input's text box, so that box must hold one line, no more. */
const MAX_TEXT_BOX_HEIGHT_IN_PX = 24;

function measureFloatingField(field: Locator) {
  return field.evaluate((input) => {
    const style = getComputedStyle(input);
    const box = input.getBoundingClientRect();
    const label = document.querySelector(`label[for="${input.id}"]`);
    const textBoxTop = box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
    const textBoxBottom =
      box.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
    const lineHeight = parseFloat(style.lineHeight);
    return {
      textBoxHeight: textBoxBottom - textBoxTop,
      textLineTop: textBoxTop + (textBoxBottom - textBoxTop - lineHeight) / 2,
      labelBottom: label === null ? Number.POSITIVE_INFINITY : label.getBoundingClientRect().bottom,
    };
  });
}

test("o rótulo do campo sobe acima da linha do texto e o cursor tem a altura de uma linha", async ({
  page,
}) => {
  await gotoHydrated(page, "/login");
  const field = page.getByLabel("E-mail");

  await field.focus();

  // The label slides up in 150 ms; poll until it settles.
  await expect
    .poll(async () => {
      const layout = await measureFloatingField(field);
      return layout.labelBottom <= layout.textLineTop;
    })
    .toBe(true);
  const layout = await measureFloatingField(field);
  expect(layout.textBoxHeight).toBeLessThanOrEqual(MAX_TEXT_BOX_HEIGHT_IN_PX);
});
