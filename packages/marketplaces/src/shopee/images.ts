import { hostnameWithoutBrackets, isNonPublicAddress } from "@sellbridge/shared/network-address";
import { z } from "zod";
import { isRetryableError, marketplaceError } from "../errors.ts";
import {
  downloadPublicFile,
  MAX_IMAGE_BYTES,
  NonPublicImageAddressError,
} from "../tiktok-shop/image-download.ts";
import { resolveHostWithDns } from "../tiktok-shop/images.ts";
import { requestPublic, type ShopeeContext } from "./client.ts";

const MAX_PRODUCT_IMAGES = 9;
const imageSchema = z.object({
  image_info: z.object({ image_id: z.string().min(1) }),
});

function downloadError(position: number, retryable: boolean) {
  return marketplaceError(
    `Não foi possível baixar a foto ${position} para a Shopee. Use um link HTTPS público para uma imagem JPG ou PNG de até 10 MB.`,
    { retryable },
  );
}

async function uploadImage(context: ShopeeContext, source: string, position: number) {
  const url = URL.parse(source);
  if (
    url === null ||
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    isNonPublicAddress(hostnameWithoutBrackets(url.hostname))
  ) {
    throw downloadError(position, false);
  }

  const download =
    context.config.downloadImage ??
    downloadPublicFile(resolveHostWithDns, MAX_IMAGE_BYTES, () => downloadError(position, false));
  let photo: Awaited<ReturnType<typeof download>>;
  try {
    photo = await download(url);
  } catch (error) {
    throw downloadError(
      position,
      !(error instanceof NonPublicImageAddressError) && isRetryableError(error),
    );
  }

  const mime = photo.contentType.split(";")[0]?.toLowerCase();
  if (
    photo.status !== 200 ||
    (mime !== "image/jpeg" && mime !== "image/png") ||
    photo.bytes.length === 0 ||
    photo.bytes.length > MAX_IMAGE_BYTES
  ) {
    throw downloadError(position, photo.status >= 500 || photo.status === 429);
  }

  const form = new FormData();
  form.set(
    "image",
    new Blob([photo.bytes], { type: mime }),
    mime === "image/png" ? "photo.png" : "photo.jpg",
  );
  form.set("scene", "normal");
  const uploaded = await requestPublic(context, {
    path: "/api/v2/media_space/upload_image",
    payload: "response",
    schema: imageSchema,
    form,
  });
  return uploaded.image_info.image_id;
}

export async function uploadImages(context: ShopeeContext, sources: readonly string[]) {
  if (sources.length === 0) {
    throw marketplaceError("A Shopee exige pelo menos uma foto do produto.", { retryable: false });
  }

  const images: string[] = [];
  for (const [index, source] of sources.slice(0, MAX_PRODUCT_IMAGES).entries()) {
    images.push(await uploadImage(context, source, index + 1));
  }

  return images;
}
