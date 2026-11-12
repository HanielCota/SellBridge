-- A profile photo is either the account's own upload, at exactly its own folder's address, or the
-- photo Google gave an account that signs in with Google. Anything else was stored before the
-- profile and sign-up checks were narrowed; the person can upload a photo again.
UPDATE "user"
SET "image" = NULL, "updated_at" = now()
WHERE "image" IS NOT NULL
  AND "image" !~ ('^/api/perfil/foto/' || "id" || '/[0-9a-f-]{36}\.(png|jpg|webp)$')
  AND NOT (
    "image" ~ '^https://'
    AND EXISTS (
      SELECT 1 FROM "account"
      WHERE "account"."user_id" = "user"."id" AND "account"."provider_id" = 'google'
    )
  );
