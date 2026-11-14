import { lookup } from "node:dns/promises";
import { withDeadline } from "@sellbridge/shared/deadline";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { hostnameWithoutBrackets, isNonPublicAddress } from "@sellbridge/shared/network-address";
import { isRetryableError, marketplaceError } from "../errors.ts";
import { requestShop, type ResolveHost, type TikTokShopContext } from "./client.ts";
import { downloadPublicImage, NonPublicImageAddressError } from "./image-download.ts";
import { uploadedImageSchema } from "./schemas.ts";

/** Gallery limit of Create Product (`main_images`, max count 9). */
export const MAX_PRODUCT_IMAGES = 9;
const LOOKUP_DEADLINE_MILLISECONDS = 5_000;

export const resolveHostWithDns: ResolveHost = async (hostname) => {
  const addresses = await withDeadline(
    lookup(hostname, { all: true, verbatim: true }),
    LOOKUP_DEADLINE_MILLISECONDS,
    "Resolução de DNS da foto do produto",
  );
  return addresses.map((entry) => entry.address);
};

function imageError(position: number, retryable: boolean, cause?: unknown) {
  return marketplaceError(
    `Não foi possível baixar a foto ${position} do produto para enviar ao TikTok Shop. Confira se o link da foto abre no navegador e publique de novo.`,
    { retryable, cause },
  );
}

/**
 * TikTok takes only uploaded files, so the worker fetches each photo itself. Product photos come
 * from suppliers, so the address must be https and resolve to public addresses only (SSRF), and
 * redirects are refused: one could lead inside the network after the check.
 */
async function assertPublicImageUrl(
  context: TikTokShopContext,
  url: URL,
  position: number,
): Promise<void> {
  if (url.protocol !== "https:") {
    throw imageError(position, false);
  }
  const resolveHost = context.config.resolveHost ?? resolveHostWithDns;
  const addresses = await resolveHost(hostnameWithoutBrackets(url.hostname));
  if (addresses.length === 0 || addresses.some((address) => isNonPublicAddress(address))) {
    throw imageError(position, false);
  }
}

async function downloadImage(
  context: TikTokShopContext,
  source: string,
  position: number,
): Promise<Blob> {
  const url = URL.parse(source);
  if (url === null) {
    throw imageError(position, false);
  }
  await assertPublicImageUrl(context, url, position);
  const resolveHost = context.config.resolveHost ?? resolveHostWithDns;
  const download = context.config.downloadImage ?? downloadPublicImage(resolveHost);
  try {
    const image = await download(url);
    const ok = image.status >= 200 && image.status < 300;
    if (!ok || !image.contentType.startsWith("image/")) {
      throw imageError(position, image.status >= 500);
    }
    return new Blob([image.bytes], { type: image.contentType });
  } catch (error) {
    logger.warn("tiktok_shop.image_download_failed", { host: url.host, position, error });
    throw imageError(position, isRetryableDownloadError(error), error);
  }
}

/** A dropped connection or a timeout may pass later; a refused address or a size never will. */
function isRetryableDownloadError(error: unknown): boolean {
  if (isAppError(error)) {
    return isRetryableError(error);
  }
  if (error instanceof NonPublicImageAddressError) {
    return false;
  }
  return true;
}

/** Uploads one photo as a gallery image and returns the URI Create Product takes. */
async function uploadImage(
  context: TikTokShopContext,
  accessToken: string,
  image: Blob,
): Promise<string> {
  const form = new FormData();
  form.set("data", image, "image");
  form.set("use_case", "MAIN_IMAGE");
  const uploaded = await requestShop(context, {
    schema: uploadedImageSchema,
    method: "POST",
    path: "/product/202309/images/upload",
    accessToken,
    form,
  });
  return uploaded.uri;
}

/** Sends the product photos to TikTok, in order, and returns their URIs. */
export async function uploadProductImages(
  context: TikTokShopContext,
  accessToken: string,
  imageUrls: readonly string[],
): Promise<string[]> {
  const sources = imageUrls.slice(0, MAX_PRODUCT_IMAGES);
  if (sources.length === 0) {
    throw marketplaceError(
      "O TikTok Shop exige pelo menos uma foto. Adicione uma foto ao produto e publique de novo.",
      { retryable: false },
    );
  }
  const uris: string[] = [];
  // One at a time: the platform throttles bursts per shop ("Rate limits").
  for (const [index, source] of sources.entries()) {
    const image = await downloadImage(context, source, index + 1);
    uris.push(await uploadImage(context, accessToken, image));
  }
  return uris;
}
