-- Retire executable test integrations without deleting historical customer records.
DELETE FROM "oauth_states" WHERE "marketplace" = 'mock';
--> statement-breakpoint
UPDATE "store_connections"
SET "status" = 'disconnected',
    "access_token_enc" = NULL,
    "refresh_token_enc" = NULL,
    "expires_at" = NULL,
    "last_error" = 'Integração descontinuada.',
    "updated_at" = now()
WHERE "marketplace" = 'mock';
--> statement-breakpoint
UPDATE "listing_targets"
SET "status" = 'paused', "external_url" = NULL, "updated_at" = now()
WHERE "store_connection_id" IN (
  SELECT "id" FROM "store_connections" WHERE "marketplace" = 'mock'
);
--> statement-breakpoint
UPDATE "webhook_events"
SET "processed_at" = now(), "error" = 'Integração descontinuada.'
WHERE "marketplace" = 'mock' AND "processed_at" IS NULL;
