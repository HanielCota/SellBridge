import { describe, expect, it } from "vitest";
import { SHARE_IMAGES, shareMeta } from "./share-meta.ts";

const contentOf = (meta: ReturnType<typeof shareMeta>, key: string) =>
  meta.find(
    (tag) => ("property" in tag && tag.property === key) || ("name" in tag && tag.name === key),
  )?.content;

describe("shareMeta", () => {
  it("repeats title and description in the tags link previews read", () => {
    const meta = shareMeta({ title: "Criar conta | SellBridge", description: "Comece pelo CEP." });

    expect(meta).toContainEqual({ title: "Criar conta | SellBridge" });
    expect(contentOf(meta, "og:title")).toBe("Criar conta | SellBridge");
    expect(contentOf(meta, "twitter:title")).toBe("Criar conta | SellBridge");
    expect(contentOf(meta, "og:description")).toBe("Comece pelo CEP.");
    expect(contentOf(meta, "description")).toBe("Comece pelo CEP.");
  });

  it("uses the brand card with a large preview by default", () => {
    const meta = shareMeta({ title: "Entrar | SellBridge", description: "Acesse." });

    expect(contentOf(meta, "og:image")).toBe(SHARE_IMAGES.brand.url);
    expect(contentOf(meta, "og:image:width")).toBe("1200");
    expect(contentOf(meta, "twitter:card")).toBe("summary_large_image");
  });

  it("uses a small card for the symbol image", () => {
    const meta = shareMeta({
      title: "Ordem de fornecimento | SellBridge",
      description: "Pedido para separar.",
      image: SHARE_IMAGES.symbol,
    });

    expect(contentOf(meta, "og:image")).toBe(SHARE_IMAGES.symbol.url);
    expect(contentOf(meta, "twitter:card")).toBe("summary");
  });

  it("points every image to an absolute https URL", () => {
    Object.values(SHARE_IMAGES).forEach((image) => expect(image.url).toMatch(/^https:\/\//));
  });
});
