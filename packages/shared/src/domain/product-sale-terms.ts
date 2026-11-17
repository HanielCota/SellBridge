import { z } from "zod";

/**
 * What a supplier promises with a product beyond its data: warranty, a video, made-to-order time
 * and whether it only travels by carrier (client report of 15/11/2026). Warranty and made-to-order
 * time become Mercado Livre `sale_terms`; the video becomes its `video_id`.
 */

export const WARRANTY_TYPES = ["none", "seller", "factory"] as const;
export type WarrantyType = (typeof WARRANTY_TYPES)[number];

export const WARRANTY_TYPE_LABELS: Readonly<Record<WarrantyType, string>> = {
  none: "Sem garantia",
  seller: "Garantia do vendedor",
  factory: "Garantia de fábrica",
};

/** Ten years: longer is a typo, not a warranty. */
export const MAX_WARRANTY_DAYS = 3650;
/** Mercado Livre shows ready-to-ship listings first; past two months the listing barely shows. */
export const MAX_MADE_TO_ORDER_DAYS = 60;

const YOUTUBE_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

function candidateId(url: URL): string | undefined {
  const [first, second] = url.pathname.split("/").filter((part) => part !== "");
  if (url.hostname === "youtu.be") {
    return first;
  }
  if (first === "shorts") {
    return second;
  }
  return url.searchParams.get("v") ?? undefined;
}

/**
 * The id of a YouTube video link ("watch?v=", "youtu.be/", "shorts/"), or null for any other
 * link. Mercado Livre takes the id, not the link.
 */
export function youtubeVideoId(link: string): string | null {
  const trimmed = link.trim();
  if (!URL.canParse(trimmed)) {
    return null;
  }
  const url = new URL(trimmed);
  if (url.protocol !== "https:" || !YOUTUBE_HOSTS.has(url.hostname)) {
    return null;
  }
  const candidate = candidateId(url);
  return candidate !== undefined && YOUTUBE_ID.test(candidate) ? candidate : null;
}

export const warrantyTypeSchema = z.enum(WARRANTY_TYPES, "Escolha o tipo de garantia");

export const warrantyDaysSchema = z
  .number("Informe a garantia em dias, como 90")
  .int("Informe a garantia em dias inteiros, como 90")
  .min(1, "A garantia precisa ter pelo menos 1 dia")
  .max(MAX_WARRANTY_DAYS, `A garantia vai até ${MAX_WARRANTY_DAYS} dias (10 anos)`);

export const madeToOrderDaysSchema = z
  .number("Informe os dias para ficar pronto, como 5")
  .int("Informe os dias para ficar pronto em números inteiros, como 5")
  .min(1, "O prazo para ficar pronto precisa ter pelo menos 1 dia")
  .max(MAX_MADE_TO_ORDER_DAYS, `O prazo para ficar pronto vai até ${MAX_MADE_TO_ORDER_DAYS} dias`);

export const productVideoUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (link) => youtubeVideoId(link) !== null,
    "Cole o link de um vídeo do YouTube, como https://www.youtube.com/watch?v=abc123DEF45",
  );

/** The warranty a listing carries as Mercado Livre names it; null when none was chosen. */
export interface ListingSaleTerms {
  readonly warrantyType: WarrantyType | null;
  readonly warrantyDays: number | null;
  readonly madeToOrderDays: number | null;
}
