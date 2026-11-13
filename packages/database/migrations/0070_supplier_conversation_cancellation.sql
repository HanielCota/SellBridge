-- A reseller can tell their supplier the buyer cancelled (topic "Cancelamento").
ALTER TYPE "public"."supplier_conversation_topic" ADD VALUE 'cancellation' BEFORE 'return';
