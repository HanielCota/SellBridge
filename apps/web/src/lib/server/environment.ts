import { parseEnvironment } from "@sellbridge/shared/environment";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { z } from "zod";

loadRootEnvironmentFile();

const base64Key32 = z.string().refine((value) => Buffer.from(value, "base64").length === 32, {
  message: "deve ser uma chave de 32 bytes em base64",
});

const serverEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  APP_URL: z.url(),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "deve ter ao menos 32 caracteres"),
  TOKEN_ENCRYPTION_KEY: base64Key32,
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
  MOCK_WEBHOOK_SECRET: z.string().min(16).default("mock-webhook-secret-dev-only"),
  MERCADO_LIVRE_CLIENT_ID: z.string().optional(),
  MERCADO_LIVRE_CLIENT_SECRET: z.string().optional(),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export const environment: ServerEnvironment = parseEnvironment(
  serverEnvironmentSchema,
  process.env,
);
