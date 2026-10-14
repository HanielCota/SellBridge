import {
  booleanFlagEnvironmentSchema,
  logLevelEnvironmentSchema,
  mockWebhookSecretEnvironmentSchema,
  nodeEnvironmentSchema,
  tokenEncryptionKeyEnvironmentSchema,
} from "@sellbridge/shared/environment";
import { z } from "zod";

/** The value .env.example ships with: fine locally, never in production. */
const PLACEHOLDER_SECRET_PREFIX = "troque-por-";

const serverEnvironmentShape = z.object({
  STRIPE_PORTAL_CONFIGURATION_ID: z.string().startsWith("bpc_").optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRO_PRICE_ID: z.string().startsWith("price_").optional(),
  STRIPE_BUSINESS_PRICE_ID: z.string().startsWith("price_").optional(),
  NODE_ENV: nodeEnvironmentSchema,
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  APP_URL: z.url(),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "deve ter ao menos 32 caracteres"),
  TOKEN_ENCRYPTION_KEY: tokenEncryptionKeyEnvironmentSchema,
  PLATFORM_FEE_BASIS_POINTS: z.coerce.number().int().min(0).max(10_000).default(0),
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
  MOCK_WEBHOOK_SECRET: mockWebhookSecretEnvironmentSchema,
  LOG_LEVEL: logLevelEnvironmentSchema,
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
});

export const serverEnvironmentSchema = serverEnvironmentShape.superRefine((value, context) => {
  if (value.NODE_ENV !== "production") {
    return;
  }
  if (!value.BETTER_AUTH_SECRET.startsWith(PLACEHOLDER_SECRET_PREFIX)) {
    return;
  }
  context.addIssue({
    code: "custom",
    path: ["BETTER_AUTH_SECRET"],
    message: "ainda é o valor do .env.example; gere outro com openssl rand -base64 32",
  });
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
