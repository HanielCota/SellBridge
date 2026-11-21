ALTER TABLE "platform_settings" ADD COLUMN "dispatch_cutoff_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "mercado_livre_cutoff_minutes" integer DEFAULT 870 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "shopee_cutoff_minutes" integer DEFAULT 780 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "tiktok_shop_cutoff_minutes" integer DEFAULT 1080 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_cutoff_minutes_check" CHECK ("platform_settings"."mercado_livre_cutoff_minutes" between 0 and 1439 and "platform_settings"."shopee_cutoff_minutes" between 0 and 1439 and "platform_settings"."tiktok_shop_cutoff_minutes" between 0 and 1439);