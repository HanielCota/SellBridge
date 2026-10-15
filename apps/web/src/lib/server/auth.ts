import { schema } from "@sellbridge/database";
import { recordAdminEvent, touchUserActivity } from "@sellbridge/database/repositories";
import type { AccountIdentity } from "@sellbridge/shared/platform-owner";
import { MIN_PASSWORD_LENGTH, nameSchema } from "@sellbridge/shared/schemas";
import { betterAuth } from "better-auth";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { z } from "zod";
import { authAccessControl, authRoles } from "../auth-roles.ts";
import { ACCOUNT_ACTION_PATHS, assertMayActOnAccount } from "./account-protection.ts";
import { isClosedToBrowsers } from "./auth-route-policy.ts";
import { database } from "./database.ts";
import { renderActionEmail } from "./email-layout.ts";
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

/** Sign-up takes the same name rules as the profile, so a name is never megabytes or blank. */
const signUpBodySchema = z.object({ name: nameSchema }).passthrough();

const updateUserBodySchema = z.object({
  name: nameSchema.optional(),
  image: z.string().nullish(),
});

type HookContext = Parameters<typeof getSessionFromCtx>[0];

/** Better Auth types the admin plugin's `role` loosely; the rules read it as a string or nothing. */
function identityOf(user: {
  email: string;
  emailVerified: boolean;
  role?: unknown;
}): AccountIdentity {
  const role = typeof user.role === "string" ? user.role : null;
  return { email: user.email, emailVerified: user.emailVerified, role };
}

/**
 * The admin plugin gives every admin power over every account. An owner and the team are only
 * changed by an owner, whether the call comes from the app's own screens or straight over HTTP.
 */
async function guardProtectedAccounts(context: HookContext): Promise<void> {
  if (!ACCOUNT_ACTION_PATHS.has(context.path)) {
    return;
  }
  const session = await getSessionFromCtx(context);
  const { internalAdapter } = context.context;
  await assertMayActOnAccount(
    {
      path: context.path,
      body: context.body,
      actor: session === null ? null : identityOf(session.user),
    },
    {
      findAccount: async (userId) => {
        const found = await internalAdapter.findUserById(userId);
        return found === null ? null : identityOf(found);
      },
      findSessionUserId: async (sessionToken) => {
        const found = await internalAdapter.findSession(sessionToken);
        return found === null ? null : found.session.userId;
      },
    },
    environment.ADMIN_EMAILS,
  );
}

function assertSignUpName(body: unknown): void {
  const parsed = signUpBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new APIError("BAD_REQUEST", {
      message: parsed.error.issues[0]?.message ?? "Dados inválidos",
    });
  }
}

/**
 * The profile page hides password and session controls while impersonating and
 * validates the name in the browser; this enforces both on the server. A photo
 * may only point at the user's own upload folder, so avatar.server.ts never
 * deletes someone else's file.
 */
const guardAccountRoutes = createAuthMiddleware(async (context) => {
  if (isClosedToBrowsers(context)) {
    throw new APIError("NOT_FOUND", { message: "Rota indisponível" });
  }
  await guardProtectedAccounts(context);
  if (context.path === "/sign-up/email") {
    assertSignUpName(context.body);
    return;
  }
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
  const email = renderActionEmail(
    {
      subject: "Redefinir sua senha do SellBridge",
      preview: "Crie uma nova senha para entrar no SellBridge. O link vale por 1 hora.",
      heading: "Crie uma nova senha",
      paragraphs: [
        "Recebemos um pedido para definir uma nova senha na sua conta do SellBridge.",
        "O botão abaixo vale por 1 hora.",
      ],
      actionLabel: "Criar nova senha",
      actionUrl: url,
      footnote: "Se você não pediu uma nova senha, pode ignorar este e-mail.",
    },
    environment.APP_URL,
  );
  await sendEmail({ to: user.email, ...email });
}

async function sendVerificationEmail({ user, url }: { user: { email: string }; url: string }) {
  const email = renderActionEmail(
    {
      subject: "Confirme seu e-mail no SellBridge",
      preview: "Falta só confirmar o seu e-mail. O link vale por 1 hora.",
      heading: "Confirme o seu e-mail",
      paragraphs: [
        "Falta só um passo para confirmar o e-mail da sua conta no SellBridge.",
        "O botão abaixo vale por 1 hora.",
      ],
      actionLabel: "Confirmar e-mail",
      actionUrl: url,
      footnote: "Se você não criou uma conta no SellBridge, pode ignorar este e-mail.",
    },
    environment.APP_URL,
  );
  await sendEmail({ to: user.email, ...email });
}

/** The admin behind a session opened with "Entrar como cliente", or null for the user's own. */
function impersonatorOf(session: object): string | null {
  if (!("impersonatedBy" in session)) {
    return null;
  }
  const { impersonatedBy } = session;
  return typeof impersonatedBy === "string" && impersonatedBy.length > 0 ? impersonatedBy : null;
}

/**
 * Bookkeeping must never block a sign-in: a failure is logged and the session goes on.
 */
async function recordActivity(userId: string): Promise<void> {
  try {
    await touchUserActivity(database, userId);
  } catch (error) {
    logger.warn("user_activity.record_failed", { userId, error });
  }
}

/** A user's own sign-in moves their "last seen"; an admin entering as them goes to the trail. */
async function recordSessionStart(session: { userId: string }): Promise<void> {
  const impersonator = impersonatorOf(session);
  if (!impersonator) {
    await recordActivity(session.userId);
    return;
  }
  try {
    await recordAdminEvent(database, {
      adminId: impersonator,
      userId: session.userId,
      action: "impersonated",
    });
  } catch (error) {
    logger.warn("admin.audit_record_failed", { userId: session.userId, error });
  }
}

export function isAdminEmail(email: string): boolean {
  return environment.ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Admin is granted only to an ADMIN_EMAILS address whose ownership is proven: verified by the
 * provider (Google) at sign-up, or later through the verification link or a Google sign-in that
 * links to the account. Otherwise anyone could register an admin address that has not signed up
 * yet. The link is sent on every sign-in of an unproven admin address, sign-up included.
 */
async function requestAdminVerification(userId: string) {
  const [user] = await database
    .select({ email: schema.user.email, emailVerified: schema.user.emailVerified })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  if (!user || user.emailVerified || !isAdminEmail(user.email)) {
    return;
  }
  try {
    await auth.api.sendVerificationEmail({ body: { email: user.email, callbackURL: "/login" } });
  } catch (error) {
    logger.error("auth.admin_verification_email_failed", { error });
  }
}

/**
 * Proving the mailbox doesn't prove who chose the password: it may have been set by someone who
 * registered the address first. So the promotion drops the password and every session, and the
 * owner sets a new password through the reset link.
 */
async function promoteVerifiedAdmin(user: { id: string; email: string; emailVerified: boolean }) {
  if (!user.emailVerified || !isAdminEmail(user.email)) {
    return;
  }
  const droppedPasswords = await database.transaction(async (transaction) => {
    const promoted = await transaction
      .update(schema.user)
      .set({ role: "admin" })
      .where(
        and(
          eq(schema.user.id, user.id),
          or(isNull(schema.user.role), ne(schema.user.role, "admin")),
        ),
      )
      .returning({ id: schema.user.id });
    if (promoted.length === 0) {
      return null;
    }
    const credentials = await transaction
      .delete(schema.account)
      .where(and(eq(schema.account.userId, user.id), eq(schema.account.providerId, "credential")))
      .returning({ id: schema.account.id });
    await transaction.delete(schema.session).where(eq(schema.session.userId, user.id));
    return credentials.length;
  });
  if (droppedPasswords === null) {
    return;
  }
  logger.info("auth.admin_promoted", { userId: user.id, droppedPasswords });
  if (droppedPasswords === 0) {
    return;
  }
  try {
    await auth.api.requestPasswordReset({
      body: { email: user.email, redirectTo: "/redefinir-senha" },
    });
  } catch (error) {
    logger.error("auth.admin_password_reset_failed", { error });
  }
}

export const auth = betterAuth({
  baseURL: environment.BETTER_AUTH_URL,
  secret: environment.BETTER_AUTH_SECRET,
  database: drizzleAdapter(database, { provider: "pg", schema }),
  // One web instance, so the in-memory store is enough; the default per-path rules
  // (sign-in, sign-up, password reset) stay in place.
  rateLimit: { enabled: environment.NODE_ENV === "production" },
  advanced: { ipAddress: { ipAddressHeaders: [environment.CLIENT_IP_HEADER] } },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    resetPasswordTokenExpiresIn: RESET_PASSWORD_EXPIRES_IN_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: sendResetPasswordEmail,
  },
  emailVerification: {
    sendVerificationEmail,
    sendOnSignUp: false,
  },
  socialProviders: googleProvider(),
  hooks: { before: guardAccountRoutes },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const isAdmin = user.emailVerified && isAdminEmail(user.email);
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
      update: {
        // Covers both the verification link and a Google sign-in linked to an unverified account.
        after: async (user) => {
          await promoteVerifiedAdmin(user);
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const organizationId = await findFirstOrganizationId(session.userId);
          return { data: { ...session, activeOrganizationId: organizationId } };
        },
        after: async (session) => {
          await requestAdminVerification(session.userId);
          await recordSessionStart(session);
        },
      },
      update: {
        // Sessions are refreshed while the user keeps using the app, which keeps "last seen" fresh.
        after: async (session) => {
          if (!session.userId || impersonatorOf(session)) {
            return;
          }
          await recordActivity(session.userId);
        },
      },
    },
  },
  plugins: [
    organization({ allowUserToCreateOrganization: false, disableOrganizationDeletion: true }),
    // Every team role is protected from impersonation, not only admins: signing in as an
    // agent would let an admin answer customers under that agent's name.
    admin({
      ac: authAccessControl,
      roles: authRoles,
      adminRoles: ["admin", "supervisor", "agent"],
    }),
    tanstackStartCookies(),
  ],
});

export type Auth = typeof auth;
