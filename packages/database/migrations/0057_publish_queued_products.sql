-- Products no longer wait for a team review (decided on 2026-11-04): a complete product goes on
-- sale as soon as it is published. The ones still queued all passed the same checks when they
-- entered the queue (nothing blocking publishing, no contact in their texts), so they go on sale.
UPDATE "supplier_products"
SET "review_status" = 'approved', "updated_at" = now()
WHERE "review_status" = 'in_review';
