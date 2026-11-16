import { expect, test } from "@playwright/test";
import { suppliers } from "@sellbridge/database/schema";
import { e2eDatabase } from "./database";
import { ADMIN_USER, controlsOwnedByReact, enableAdminMode, gotoHydrated, signIn } from "./helpers";

/** How much slower than this machine the browser runs: about a busy CI runner. */
const SLOW_CPU_RATE = 4;

// On a slow runner the root marked the page hydrated while React still had the page under it to
// hydrate, and a click in that gap did nothing ("Desativar", "Entrar como fornecedor").
test("gotoHydrated returns only once React owns every control, even on a slow machine", async ({
  page,
}) => {
  const database = e2eDatabase();
  const [supplier] = await database.select({ id: suppliers.id }).from(suppliers).limit(1);
  await database.$client.end();
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  const devtools = await page.context().newCDPSession(page);
  await devtools.send("Emulation.setCPUThrottlingRate", { rate: SLOW_CPU_RATE });

  await gotoHydrated(page, `/admin/fornecedores/${supplier?.id ?? ""}`);

  expect(await page.evaluate(controlsOwnedByReact)).toBe(true);
});
