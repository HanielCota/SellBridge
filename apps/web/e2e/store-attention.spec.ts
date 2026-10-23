import { expect, test } from "@playwright/test";
import { member, storeConnections, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { completeOnboarding, gotoHydrated, signUp } from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();
const failure = "Falha ao renovar o acesso da loja; tentaremos de novo";

test.afterAll(async () => {
  await database.$client.end();
});

/** The organization of a freshly signed-up account, so no other spec ever sees its stores. */
async function tenantOf(email: string): Promise<string> {
  const [seller] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);
  if (seller === undefined) {
    throw new Error("Conta nova sem organização no banco de teste");
  }
  return seller.tenantId;
}

test("a store whose last refresh failed shows the attention state on its card", async ({
  page,
}) => {
  const email = await signUp(page, "Revendedora Atenção");
  await completeOnboarding(page);
  const shopName = `Loja atenção E2E ${Date.now()}`;
  // What the worker leaves after a marketplace 5xx: still connected, with the reason kept.
  await database.insert(storeConnections).values({
    tenantId: await tenantOf(email),
    marketplace: "mock",
    externalShopId: `attention-${Date.now()}`,
    shopName,
    lastError: failure,
  });

  await gotoHydrated(page, "/lojas");
  const card = page.getByRole("listitem").filter({ hasText: shopName });
  await expect(card.getByText(failure)).toBeVisible();
  await expect(card.getByText("Atenção", { exact: true })).toBeAttached();
  await expect(card.getByText("Conectada", { exact: false })).toHaveCount(0);
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await card.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow, `card overflows at ${width}px`).toBeLessThanOrEqual(0);
    await card.screenshot({ path: test.info().outputPath(`store-attention-card-${width}.png`) });
  }
});
