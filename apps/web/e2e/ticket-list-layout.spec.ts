import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { member, ticketMessages, tickets } from "@sellbridge/database/schema";
import { eq, inArray } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";
import { accountId } from "./profile-fixtures";

const database = e2eDatabase();
const createdTicketIds: string[] = [];

/** Rounding of sub-pixel layout: markers this close count as one column. */
const SAME_COLUMN_PIXELS = 2;

test.afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await database.delete(tickets).where(inArray(tickets.id, createdTicketIds));
  }
  await database.$client.end();
});

/** Tickets from the demo reseller, each with a message the team has not read yet. */
async function seedUnreadTickets(marker: string): Promise<void> {
  const userId = await accountId(database, DEMO_USER.email);
  const [membership] = await database
    .select({ tenantId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));
  if (membership === undefined) {
    throw new Error(`demo account without a profile: ${DEMO_USER.email}`);
  }
  // Topics of very different lengths: the old marker sat right after the topic and wandered.
  const categories = ["account", "payment", "listing"] as const;
  for (const category of categories) {
    const [ticket] = await database
      .insert(tickets)
      .values({
        tenantId: membership.tenantId,
        createdById: userId,
        subject: `${marker} ${category}`,
        category,
      })
      .returning({ id: tickets.id });
    if (ticket === undefined) {
      throw new Error(`ticket not created for ${category}`);
    }
    createdTicketIds.push(ticket.id);
    await database
      .insert(ticketMessages)
      .values({ ticketId: ticket.id, authorId: userId, body: "Mensagem de teste." });
  }
}

/** Scroll positions (every 8 px) where the box is cut by the header's bottom edge. */
function positionsPartlyUnderHeader(box: Element): number[] {
  const header = document.querySelector("header");
  if (header === null) {
    throw new Error("app header missing");
  }
  const lastPosition = Math.min(800, document.documentElement.scrollHeight - window.innerHeight);
  const covered: number[] = [];
  for (let position = 0; position <= lastPosition; position += 8) {
    window.scrollTo(0, position);
    const headerBottom = header.getBoundingClientRect().bottom;
    const rect = box.getBoundingClientRect();
    if (rect.top < headerBottom - 1 && rect.bottom > headerBottom + 1) {
      covered.push(position);
    }
  }
  return covered;
}

async function openTeamQueue(page: Page, query: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, `/admin/chamados?queue=all${query}`);
}

test("lines up the unread markers of every row in one column", async ({ page }) => {
  const marker = `Alinhamento ${randomUUID().slice(0, 8)}`;
  await seedUnreadTickets(marker);

  await openTeamQueue(page, `&query=${encodeURIComponent(marker)}`);
  const table = page.getByRole("table");
  await expect(table.getByRole("row").filter({ hasText: marker })).toHaveCount(3);
  const markers = table.getByText("Mensagem nova", { exact: true });
  await expect(markers).toHaveCount(3);
  const lefts = await markers.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().left),
  );

  expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(SAME_COLUMN_PIXELS);
});

for (const viewport of [
  { name: "computer", width: 1440, height: 900 },
  { name: "phone", width: 375, height: 812 },
]) {
  test(`never leaves the search box half hidden under the header on the ${viewport.name}`, async ({
    page,
  }) => {
    await openTeamQueue(page, "");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const search = page.getByRole("searchbox", { name: "Buscar chamados" });
    await expect(search).toBeVisible();

    // Every scroll position in one pass, read straight after each jump. Polled: the header
    // publishes its height for the toolbar a moment after the page reports itself hydrated.
    await expect
      .poll(() => search.evaluate(positionsPartlyUnderHeader), { timeout: 10_000 })
      .toEqual([]);
  });
}
