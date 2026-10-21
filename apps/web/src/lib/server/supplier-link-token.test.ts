import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasTokenInUrl, readLabelForm, tokenOf } from "./supplier-link-token";

const LABEL_URL = "https://sellbridge.test/api/pedidos/order-1/etiqueta";
const TOKEN = "a".repeat(43);

function formPost(fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields);
  return new Request(LABEL_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("reading the label form", () => {
  it("reads the token from a form posted by the supplier page", async () => {
    expect(tokenOf(await readLabelForm(formPost({ token: TOKEN })))).toBe(TOKEN);
  });

  it("finds none in a GET, even with the token in the URL", async () => {
    expect(tokenOf(await readLabelForm(new Request(`${LABEL_URL}?token=${TOKEN}`)))).toBeNull();
    expect(tokenOf(await readLabelForm(formPost({})))).toBeNull();
  });

  it("keeps the panel's ids for the session check", async () => {
    const form = await readLabelForm(formPost({ supplierId: "s-1", shipmentId: "p-1" }));
    expect(form?.get("shipmentId")).toBe("p-1");
    expect(tokenOf(form)).toBeNull();
  });
});

describe("hasTokenInUrl", () => {
  it("spots an old link that still carries the token", () => {
    expect(hasTokenInUrl(new Request(`${LABEL_URL}?token=${TOKEN}`))).toBe(true);
    expect(hasTokenInUrl(new Request(LABEL_URL))).toBe(false);
  });
});

/**
 * Every server function of a file, each with the source up to the next one, so a function never
 * borrows a neighbour's validator. Without `method` it is a GET, Start's default.
 */
function serverFunctions(source: string) {
  const starts = [...source.matchAll(/export const (\w+) = createServerFn\(/g)];
  return starts.map((start, position) => {
    const end = starts[position + 1]?.index ?? source.length;
    const body = source.slice(start.index, end);
    const method = /createServerFn\(\{\s*method:\s*"(\w+)"/.exec(body)?.[1] ?? "GET";
    return { name: start[1] ?? "", method, body };
  });
}

describe("supplier link server functions", () => {
  it("never take the token by GET, which would put it in the request URL", () => {
    const features = fileURLToPath(new URL("../../features", import.meta.url));
    const files = readdirSync(features, { recursive: true, encoding: "utf8" }).filter((file) =>
      file.endsWith(".functions.ts"),
    );
    const byGet = files.flatMap((file) =>
      serverFunctions(readFileSync(join(features, file), "utf8"))
        .filter(
          (serverFunction) =>
            serverFunction.method === "GET" && serverFunction.body.includes("supplierTokenSchema"),
        )
        .map((serverFunction) => serverFunction.name),
    );
    expect(byGet).toEqual([]);
  });
});
