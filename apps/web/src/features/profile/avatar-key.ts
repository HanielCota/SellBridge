import { z } from "zod";

export const AVATAR_URL_PREFIX = "/api/perfil/foto/";

export const avatarPathSchema = z.object({
  userId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  fileName: z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|webp)$/),
});

/**
 * Storage key of a photo this user owns, or null for external images (e.g. Google)
 * and for URLs pointing at someone else's folder.
 */
export function avatarStorageKey(
  imageUrl: string | null | undefined,
  ownerId: string,
): string | null {
  if (!imageUrl?.startsWith(AVATAR_URL_PREFIX)) {
    return null;
  }
  const [userId, fileName] = imageUrl.slice(AVATAR_URL_PREFIX.length).split("/");
  const parsed = avatarPathSchema.safeParse({ userId, fileName });
  if (!parsed.success || parsed.data.userId !== ownerId) {
    return null;
  }
  return `avatars/${parsed.data.userId}/${parsed.data.fileName}`;
}
