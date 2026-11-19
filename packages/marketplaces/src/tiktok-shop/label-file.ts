import { logger } from "@sellbridge/shared/logger";
import { isMarketplaceError, marketplaceError } from "../errors.ts";
import type { StoreCredentials } from "../types.ts";
import type { TikTokShopContext } from "./client.ts";
import { downloadPublicFile, type DownloadedFile, type DownloadFile } from "./image-download.ts";
import { resolveHostWithDns } from "./images.ts";
import { getTikTokShopLabel } from "./shipping.ts";

/** A shipping label is a page or two; a bigger file is not one. */
export const MAX_LABEL_BYTES = 5 * 1024 * 1024;
const PDF_SIGNATURE = "%PDF-";
const HTTP_OK = 200;

/**
 * Domains TikTok Shop serves shipping documents from. The documented example link is on
 * bytedance.net. [live test] the production link's host, which must be on this list.
 */
const LABEL_HOST_DOMAINS = [
  "bytedance.net",
  "byteoversea.com",
  "ibyteimg.com",
  "tiktokcdn.com",
  "tiktokglobalshop.com",
  "tiktokshop.com",
] as const;

export interface TikTokShopLabelFile {
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** The package the label belongs to, kept on the parcel like Mercado Livre's shipment id. */
  readonly packageId: string;
}

function labelDownloadError(retryable: boolean, cause?: unknown) {
  return marketplaceError(
    "Não foi possível baixar a etiqueta do TikTok Shop. Tente de novo em alguns minutos.",
    { retryable, cause },
  );
}

function isLabelHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LABEL_HOST_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Only https links on TikTok's own domains: the link comes from the API, never from a person. */
function labelUrl(source: string): URL {
  const url = URL.parse(source);
  if (url === null || url.protocol !== "https:" || !isLabelHost(url.hostname)) {
    logger.warn("tiktok_shop.label_host_refused", { host: url?.hostname ?? null });
    throw labelDownloadError(false);
  }
  return url;
}

function isPdf(bytes: Uint8Array<ArrayBuffer>): boolean {
  return new TextDecoder().decode(bytes.subarray(0, PDF_SIGNATURE.length)) === PDF_SIGNATURE;
}

async function download(downloadFile: DownloadFile, url: URL): Promise<DownloadedFile> {
  try {
    return await downloadFile(url);
  } catch (error) {
    if (isMarketplaceError(error)) {
      throw error;
    }
    throw labelDownloadError(true, error);
  }
}

/**
 * The order's shipping label as a PDF file. TikTok hands out only a temporary link, so the label
 * is downloaded here (https, TikTok's domains, public addresses, no redirects, 5 MB at most) and
 * served by SellBridge like Mercado Livre's.
 */
export async function getTikTokShopLabelFile(
  context: TikTokShopContext,
  store: StoreCredentials,
  orderId: string,
): Promise<TikTokShopLabelFile> {
  const label = await getTikTokShopLabel(context, store, orderId);
  const url = labelUrl(label.url);
  const downloadFile =
    context.config.downloadFile ??
    downloadPublicFile(context.config.resolveHost ?? resolveHostWithDns, MAX_LABEL_BYTES, () =>
      labelDownloadError(false),
    );
  const file = await download(downloadFile, url);
  if (file.status !== HTTP_OK || !isPdf(file.bytes)) {
    logger.warn("tiktok_shop.label_download_failed", { status: file.status });
    throw labelDownloadError(true);
  }
  return { bytes: file.bytes, packageId: label.packageId };
}
