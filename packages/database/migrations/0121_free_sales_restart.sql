-- Accounts created before the free sales offer (26/11/2026, Brasília) start counting from zero,
-- like a new account, and a reversed sale gives its slot back. Only rows holding a slot change,
-- at most 20 per account, so the lock on "orders" is short.
UPDATE "orders"
SET "free_sale_slot" = NULL
WHERE "free_sale_slot" IS NOT NULL
  AND (
    "reversed_at" IS NOT NULL
    OR "tenant_id" IN (
      SELECT "id" FROM "organization" WHERE "created_at" < '2026-11-27T03:00:00Z'
    )
  );
