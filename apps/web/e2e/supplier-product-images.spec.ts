import { expect, request, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database";
import { suppliers } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ADMIN_USER, signIn } from "./helpers";
import { requireEnvironmentVariable } from "./environment";

/**
 * Product photos sent from the device: stored under the supplier and served on a public link,
 * because the marketplaces fetch a listing's photos without a session.
 */
const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
let supplierId = "";

/** A valid 1×1 PNG: the server checks the file's signature and dimensions, not its name. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeAll(async () => {
  const [supplier] = await database
    .insert(suppliers)
    .values({
      name: `Fornecedor fotos E2E ${Date.now()}`,
      niche: "Casa",
      state: "SP",
      city: "Teste",
    })
    .returning({ id: suppliers.id });
  if (supplier === undefined) {
    throw new Error("fornecedor não criado");
  }
  supplierId = supplier.id;
});

test.afterAll(async () => {
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.$client.end();
});

test("a foto enviada do dispositivo ganha um link público", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  const upload = (buffer: Buffer, name: string) =>
    page.request.post("/api/fornecedor/produtos/imagens", {
      multipart: { supplierId, file: { name, mimeType: "image/png", buffer } },
    });

  const sent = await upload(PIXEL_PNG, "foto.png");
  expect(sent.status()).toBe(200);
  const { url } = z.object({ url: z.string() }).parse(await sent.json());
  expect(url).toContain(`/api/produtos/imagens/${supplierId}/`);

  // A marketplace has no session: the link must answer to anyone.
  const anonymous = await request.newContext();
  const photo = await anonymous.get(url);
  expect(photo.status()).toBe(200);
  expect(photo.headers()["content-type"]).toBe("image/png");
  await anonymous.dispose();

  const notAnImage = await upload(Buffer.from("não é imagem"), "falsa.png");
  expect(notAnImage.status()).toBe(400);
  expect(await notAnImage.json()).toEqual({ error: "Envie uma imagem PNG, JPG ou WEBP" });
});
