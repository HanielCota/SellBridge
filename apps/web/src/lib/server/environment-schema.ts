import {
  alertWebhookUrlEnvironmentSchema,
  booleanFlagEnvironmentSchema,
  logLevelEnvironmentSchema,
  nodeEnvironmentSchema,
  refusePrivateWebhookUrlsInProduction,
  shopeeShowcaseUnitsEnvironmentSchema,
  tokenEncryptionKeyEnvironmentSchema,
} from "@sellbridge/shared/environment";
import { SUPPORT_ASSISTANT_PROVIDERS } from "@sellbridge/shared/support-assistant";
import { z } from "zod";
import {
  CARRIER_TRACKING_PROVIDERS,
  type CarrierTrackingProviderName,
} from "@/features/tracking/carrier-tracking";

/** The value .env.example ships with: fine locally, never in production. */
const PLACEHOLDER_SECRET_PREFIX = "troque-por-";

const serverEnvironmentShape = z.object({
  STRIPE_PORTAL_CONFIGURATION_ID: z.string().startsWith("bpc_").optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRO_PRICE_ID: z.string().startsWith("price_").optional(),
  STRIPE_BUSINESS_PRICE_ID: z.string().startsWith("price_").optional(),
  /**
   * Production without Stripe refuses to start unless this says so: no Stripe means no plan
   * limits at all (item 16, N8).
   */
  BILLING_UNLIMITED: booleanFlagEnvironmentSchema,
  /** Days a failed renewal (past_due) keeps the paid limits before falling back to Gratuito. */
  BILLING_PAST_DUE_GRACE_DAYS: z.coerce.number().int().min(0).max(60).default(7),
  NODE_ENV: nodeEnvironmentSchema,
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  APP_URL: z.url(),
  BETTER_AUTH_URL: z.url(),
  /**
   * Extra origins (comma separated) the app is also served on, read by Better Auth too. Our own
   * redirects stay on these hosts instead of jumping to APP_URL, where the session cookie is not.
   */
  BETTER_AUTH_TRUSTED_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .pipe(z.array(z.url().transform((origin) => new URL(origin).origin))),
  BETTER_AUTH_SECRET: z.string().min(32, "deve ter ao menos 32 caracteres"),
  TOKEN_ENCRYPTION_KEY: tokenEncryptionKeyEnvironmentSchema,
  PLATFORM_FEE_BASIS_POINTS: z.coerce.number().int().min(0).max(10_000).default(0),
  /** Marketplace commission the previews estimate before an order reports the real one. */
  ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS: z.coerce.number().int().min(0).max(10_000).default(1400),
  // TODO(client:D5): who pays the shipping; 0 keeps it out of the previews until then.
  ESTIMATED_SHIPPING_CENTS: z.coerce.number().int().min(0).max(100_000_000).default(0),
  /** Margin a price must keep after every fee; 0 only forbids selling at a loss. */
  MIN_MARGIN_PERCENT: z.coerce.number().int().min(0).max(90).default(0),
  /** Units the sync keeps off the marketplaces (the worker's own); none of them may be published. */
  STOCK_SAFETY_UNITS: z.coerce.number().int().min(0).max(1000).default(0),
  /** Units the worker adds to Shopee listings (the worker's own); screens show the real units. */
  SHOPEE_SHOWCASE_UNITS: shopeeShowcaseUnitsEnvironmentSchema,
  UPLOADS_DIR: z.string().min(1).default("./uploads"),
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0),
    ),
  LOG_LEVEL: logLevelEnvironmentSchema,
  ALERT_WEBHOOK_URL: alertWebhookUrlEnvironmentSchema,
  /** Transactional e-mail (password reset). Without it, development logs the message. */
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).default("SellBridge <no-reply@sellbridge.local>"),
  /** "Continuar com Google" appears only when both are set. */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  MERCADO_LIVRE_CLIENT_ID: z.string().optional(),
  MERCADO_LIVRE_CLIENT_SECRET: z.string().optional(),
  /**
   * Lets webhook endpoints point to localhost and private networks (local development only).
   * Off in production: otherwise a customer could make the server call internal services.
   */
  WEBHOOK_ALLOW_PRIVATE_URLS: booleanFlagEnvironmentSchema,
  /**
   * Header holding the client IP used by the login rate limit. Behind the Cloudflare proxy use
   * "cf-connecting-ip": x-forwarded-for would then carry Cloudflare's address for every user.
   */
  CLIENT_IP_HEADER: z.string().trim().toLowerCase().default("x-forwarded-for"),
  /**
   * Refuses new passwords found in known breaches (Have I Been Pwned, item 30.c). "auto" turns it
   * on in production only, so tests and local sign-ups never depend on the outside service.
   */
  LEAKED_PASSWORD_CHECK: z.enum(["auto", "on", "off"]).default("auto"),
  /** Carrier tracking stays off until a real integration is configured. */
  CARRIER_TRACKING_PROVIDER: z.enum(CARRIER_TRACKING_PROVIDERS).optional(),
  /**
   * Who writes the automatic first answer in support. "deepseek" is not wired yet: it reports
   * "not configured" and the local FAQ answers instead.
   */
  SUPPORT_ASSISTANT_PROVIDER: z.enum(SUPPORT_ASSISTANT_PROVIDERS).default("faq"),
});

const STRIPE_REQUIRED_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_BUSINESS_PRICE_ID",
] as const;

type ServerEnvironmentShape = z.infer<typeof serverEnvironmentShape>;

function checkPlaceholderSecret(value: ServerEnvironmentShape, context: z.RefinementCtx) {
  if (!value.BETTER_AUTH_SECRET.startsWith(PLACEHOLDER_SECRET_PREFIX)) {
    return;
  }
  context.addIssue({
    code: "custom",
    path: ["BETTER_AUTH_SECRET"],
    message: "ainda é o valor do .env.example; gere outro com openssl rand -base64 32",
  });
}

function checkProductionBilling(value: ServerEnvironmentShape, context: z.RefinementCtx) {
  if (value.BILLING_UNLIMITED) {
    return;
  }
  for (const key of STRIPE_REQUIRED_KEYS) {
    if (value[key] !== undefined) {
      continue;
    }
    context.addIssue({
      code: "custom",
      path: [key],
      message: "obrigatória em produção; sem o Stripe defina BILLING_UNLIMITED=true (sem limites)",
    });
  }
}

export const serverEnvironmentSchema = serverEnvironmentShape.superRefine((value, context) => {
  if (value.NODE_ENV !== "production") {
    return;
  }
  checkPlaceholderSecret(value, context);
  checkProductionBilling(value, context);
  refusePrivateWebhookUrlsInProduction(value, context);
});

/** No synthetic tracking is available in any environment. */
export function carrierTrackingProviderName(
  environment: Pick<ServerEnvironmentShape, "CARRIER_TRACKING_PROVIDER">,
): CarrierTrackingProviderName {
  return environment.CARRIER_TRACKING_PROVIDER ?? "off";
}

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
