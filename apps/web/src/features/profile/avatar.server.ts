import { randomUUID } from "node:crypto";
import { unauthorizedError, validationError } from "@sellbridge/shared/errors";
import { detectAttachmentType } from "@sellbridge/shared/file-signature";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { handleApi, jsonResponse } from "@/lib/server/http";
import { fileStorage } from "@/lib/server/storage";

/** The browser already crops and shrinks the photo; this only guards the server. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_URL_PREFIX = "/api/perfil/foto/";
const EXTENSION_BY_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
type AvatarType = keyof typeof EXTENSION_BY_TYPE;

const avatarPathSchema = z.object({
  userId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  fileName: z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|webp)$/),
});

function isAvatarType(type: string | null): type is AvatarType {
  return type !== null && type in EXTENSION_BY_TYPE;
}

/** Storage key of a photo we host, or null for external images (e.g. Google). */
export function avatarStorageKey(imageUrl: string | null | undefined): string | null {
  if (!imageUrl?.startsWith(AVATAR_URL_PREFIX)) {
    return null;
  }
  const [userId, fileName] = imageUrl.slice(AVATAR_URL_PREFIX.length).split("/");
  const parsed = avatarPathSchema.safeParse({ userId, fileName });
  return parsed.success ? `avatars/${parsed.data.userId}/${parsed.data.fileName}` : null;
}

async function readAvatarFile(request: Request): Promise<{ bytes: Uint8Array; type: AvatarType }> {
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw validationError("Escolha uma imagem para enviar");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw validationError("A foto deve ter no máximo 2 MB");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectAttachmentType(bytes);
  if (!isAvatarType(type)) {
    throw validationError("Envie uma imagem PNG, JPG ou WEBP");
  }
  return { bytes, type };
}

async function requireSession(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw unauthorizedError();
  }
  return session;
}

async function replaceImage(
  headers: Headers,
  previous: string | null | undefined,
  next: string | null,
) {
  await auth.api.updateUser({ headers, body: { image: next } });
  const previousKey = avatarStorageKey(previous);
  if (previousKey) {
    await fileStorage.delete(previousKey);
  }
}

/** POST /api/perfil/foto — multipart "file"; replaces the signed-in user's photo. */
export function handleUploadAvatar(request: Request) {
  return handleApi("profile.upload_avatar", async () => {
    const session = await requireSession(request.headers);
    const { bytes, type } = await readAvatarFile(request);
    const fileName = `${randomUUID()}.${EXTENSION_BY_TYPE[type]}`;
    await fileStorage.put(`avatars/${session.user.id}/${fileName}`, bytes);
    const image = `${AVATAR_URL_PREFIX}${session.user.id}/${fileName}`;
    await replaceImage(request.headers, session.user.image, image);
    logger.info("profile.avatar_updated", { userId: session.user.id });
    return jsonResponse(200, { image });
  });
}

/** DELETE /api/perfil/foto — back to the initials. */
export function handleDeleteAvatar(request: Request) {
  return handleApi("profile.delete_avatar", async () => {
    const session = await requireSession(request.headers);
    await replaceImage(request.headers, session.user.image, null);
    logger.info("profile.avatar_removed", { userId: session.user.id });
    return jsonResponse(200, { image: null });
  });
}

/** GET /api/perfil/foto/:userId/:fileName — any signed-in user may see profile photos. */
export function handleGetAvatar(request: Request, params: { userId?: string; fileName?: string }) {
  return handleApi("profile.get_avatar", async () => {
    await requireSession(request.headers);
    const parsed = avatarPathSchema.safeParse(params);
    if (!parsed.success) {
      return jsonResponse(404, { error: "Foto não encontrada" });
    }
    const bytes = await fileStorage.get(`avatars/${parsed.data.userId}/${parsed.data.fileName}`);
    if (!bytes) {
      return jsonResponse(404, { error: "Foto não encontrada" });
    }
    const extension = parsed.data.fileName.split(".").at(-1);
    const type = Object.entries(EXTENSION_BY_TYPE).find(([, value]) => value === extension)?.[0];
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": type ?? "application/octet-stream",
        "x-content-type-options": "nosniff",
        // Every upload gets a new file name, so the URL never changes content.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  });
}
