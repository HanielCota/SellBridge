import { expect, type Locator } from "@playwright/test";

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

export function boxesOverlap(first: Box, second: Box): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

function boxContains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("Element has no box on the page");
  }
  return box;
}

/** The listing card's "Esgotado" sits whole inside the card and clear of its status button. */
export async function expectSoldOutTagReadable(card: Locator): Promise<Box> {
  const soldOut = card.getByText("Esgotado", { exact: true });
  await expect(soldOut).toBeVisible();
  const soldOutBox = await boxOf(soldOut);
  const statusButton = await boxOf(card.getByRole("button", { name: /^Ações de / }));
  const cardBox = await boxOf(card);

  expect(boxContains(cardBox, soldOutBox)).toBe(true);
  expect(boxesOverlap(soldOutBox, statusButton)).toBe(false);
  return soldOutBox;
}
