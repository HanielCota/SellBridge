import { schema } from "@sellbridge/database";
import { MIN_PASSWORD_LENGTH, nameSchema } from "@sellbridge/shared/schemas";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { z } from "zod";
import { database } from "./database.ts";
import { environment } from "./environment.ts";
import { sendEmail } from "./mailer.ts";
import { findFirstOrganizationId } from "./membership.ts";
import { logger } from "@sellbridge/shared/logger";

function slugify(value: string): string {
  const base = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base.length > 0 ? base : "loja";
}

const RESET_PASSWORD_EXPIRES_IN_SECONDS = 60 * 60;

/** Account-security routes an admin impersonating a customer must not reach. */
const OWNER_ONLY_PATHS = new Set([
  "/change-password",
  "/set-password",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
]);

const updateUserBodySchema = z.object({
  name: nameSchema.optional(),
  image: z.string().nullish(),
});

/**
 * The profile page hides password and session controls while impersonating and
 * validates the name in the browser; this enforces both on the server. A photo
 * may only point at the user's own upload folder, so avatar.server.ts never
 * deletes someone else's file.
 */
const guardAccountRoutes = createAuthMiddleware(async (context) => {
  const isOwnerOnly = OWNER_ONLY_PATHS.has(context.path);
  const isUpdateUser = context.path === "/update-user";
  if (!isOwnerOnly && !isUpdateUser) {
    return;
  }
  const session = await getSessionFromCtx(context);
  if (!session) {
    return;
  }
  if (isOwnerOnly && session.session.impersonatedBy) {
    throw new APIError("FORBIDDEN", { message: "Indisponível durante o acesso como cliente" });
  }
  if (isUpdateUser) {
    const parsed = updateUserBodySchema.safeParse(context.body);
    if (!parsed.success) {
      throw new APIError("BAD_REQUEST", {
        message: parsed.error.issues[0]?.message ?? "Dados inválidos",
      });
    }
    const { image } = parsed.data;
    if (image && !image.startsWith(`/api/perfil/foto/${session.user.id}/`)) {
      throw new APIError("BAD_REQUEST", { message: "Foto inválida" });
    }
  }
});

export const isGoogleSignInEnabled = Boolean(
  environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET,
);

function googleProvider() {
  if (!environment.GOOGLE_CLIENT_ID || !environment.GOOGLE_CLIENT_SECRET) {
    return {};
  }
  return {
    google: {
      clientId: environment.GOOGLE_CLIENT_ID,
      clientSecret: environment.GOOGLE_CLIENT_SECRET,
      prompt: "select_account" as const,
    },
  };
}

async function sendResetPasswordEmail({ user, url }: { user: { email: string }; url: string }) {
  await sendEmail({
    to: user.email,
    subject: "Redefinir sua senha do SellBridge",
    text: [
      "Recebemos um pedido para redefinir a senha da sua conta no SellBridge.",
      "",
      "Para criar uma nova senha, abra o link abaixo (válido por 1 hora):",
      url,
      "",
      "Se você não fez esse pedido, ignore este e-mail. Sua senha continua a mesma.",
    ].join("\n"),
  });
}

export const auth = betterAuth({
  baseURL: environment.BETTER_AUTH_URL,
  secret: environment.BETTER_AUTH_SECRET,
  database: drizzleAdapter(database, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    resetPasswordTokenExpiresIn: RESET_PASSWORD_EXPIRES_IN_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: sendResetPasswordEmail,
  },
  socialProviders: googleProvider(),
  hooks: { before: guardAccountRoutes },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const isAdmin = environment.ADMIN_EMAILS.includes(user.email.toLowerCase());
          return { data: { ...user, role: isAdmin ? "admin" : "user" } };
        },
        after: async (user) => {
          const suffix = user.id.slice(0, 6).toLowerCase();
          await auth.api.createOrganization({
            body: {
              name: user.name,
              slug: `${slugify(user.name)}-${suffix}`,
              userId: user.id,
            },
          });
          logger.info("organization.created_for_user", { userId: user.id });
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const organizationId = await findFirstOrganizationId(session.userId);
          return { data: { ...session, activeOrganizationId: organizationId } };
        },
      },
    },
  },
  plugins: [organization(), admin(), tanstackStartCookies()],
});

export type Auth = typeof auth;
