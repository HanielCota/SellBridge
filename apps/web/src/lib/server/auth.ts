import { schema } from "@sellbridge/database";
import {
  promoteVerifiedOwner,
  recordAdminEvent,
  touchUserActivity,
} from "@sellbridge/database/repositories";
import type { AccountIdentity } from "@sellbridge/shared/platform-owner";
import { MIN_PASSWORD_LENGTH, nameSchema } from "@sellbridge/shared/schemas";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { z } from "zod";
import { authAccessControl, authRoles } from "../auth-roles.ts";
import { ACCOUNT_ACTION_PATHS, assertMayActOnAccount } from "./account-protection.ts";
import { ACCOUNT_SECURITY_PATHS, isClosedToBrowsers } from "./auth-route-policy.ts";
import { recordImpersonatedCall, recordImpersonationEnded } from "./impersonation.ts";
import { IMPERSONATION_SECONDS, isImpersonationOver } from "./impersonation-window.ts";
import { database } from "./database.ts";
import { renderActionEmail } from "@sellbridge/shared/email-layout";
import { environment } from "./environment.ts";
import { sendEmail } from "./mailer.ts";
import { findFirstOrganizationId } from "./membership.ts";
import { logger } from "@sellbridge/shared/logger";
import { isTeamInviteLink, teamInviteEmail } from "@/features/admin/team-invite-email";
import { isLeakedPasswordCheckOn, leakedPasswordCheck } from "./leaked-password";
import {
  afterAccountDeletion,
  assertDeletionRequest,
  beforeAccountDeletion,
} from "./account-deletion.server";

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
  if (context.path === "/delete-user") {
    assertDeletionRequest(context.body);
  }
  const isAccountSecurity = ACCOUNT_SECURITY_PATHS.has(context.path);
  const isUpdateUser = context.path === "/update-user";
  if (!isAccountSecurity && !isUpdateUser) {
    return;
  }
  const session = await getSessionFromCtx(context);
  if (!session) {
    return;
  }
  if (session.session.impersonatedBy && isImpersonationOver(new Date(session.session.createdAt))) {
    throw new APIError("UNAUTHORIZED", {
      message: "O acesso como cliente terminou. Volte ao admin.",
    });
  }
  if (isAccountSecurity && session.session.impersonatedBy) {
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

/**
 * What an admin did on Better Auth's own routes during a visit as the customer, once the route
 * went through: "Voltar ao admin" closes the visit in the timeline, and a name change made there
 * goes under the admin's name like the server functions (`tenantMiddleware`).
 */
const recordVisitEvents = createAuthMiddleware(async (context) => {
  const isVisitRoute =
    context.path === "/admin/stop-impersonating" || context.path === "/update-user";
  if (!isVisitRoute || isAPIError(context.context.returned)) {
    return;
  }
  const session = await getSessionFromCtx(context);
  if (session === null) {
    return;
  }
  const visit = { userId: session.user.id, impersonatedBy: impersonatorOf(session.session) };
  if (context.path === "/admin/stop-impersonating") {
    await recordImpersonationEnded(visit);
    return;
  }
  await recordImpersonatedCall({
    impersonatedBy: visit.impersonatedBy,
    customerId: visit.userId,
    functionName: "profile.update",
    method: "POST",
  });
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
  // A team invite (item 28.a) sends the same link, worded as a welcome.
  if (isTeamInviteLink(url)) {
    await sendEmail({
      to: user.email,
      ...renderActionEmail(teamInviteEmail(url), environment.APP_URL),
    });
    return;
  }
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
 * Proving the mailbox doesn't prove who set the sign-in methods: a password or a social login may
 * belong to whoever registered the address first. The promotion drops them all with every session
 * (`promoteVerifiedOwner`); the owner sets a new password through the reset link, or signs in with
 * Google again.
 */
async function promoteVerifiedAdmin(user: { id: string; email: string; emailVerified: boolean }) {
  if (!user.emailVerified || !isAdminEmail(user.email)) {
    return;
  }
  const promotion = await promoteVerifiedOwner(database, user.id);
  if (!promotion.promoted) {
    return;
  }
  logger.info("auth.admin_promoted", { userId: user.id, hadPassword: promotion.hadPassword });
  if (!promotion.hadPassword) {
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
  rateLimit: {
    enabled: environment.NODE_ENV === "production",
    // A stolen session must not be able to guess the password through account deletion.
    customRules: { "/delete-user": { window: 60, max: 5 } },
  },
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
    // A new store waits for the confirmed e-mail (item 26.b), so the link goes out on sign-up.
    sendOnSignUp: true,
  },
  socialProviders: googleProvider(),
  // Self-service deletion (LGPD), always with the password: see account-deletion.server.ts.
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => beforeAccountDeletion(user),
      afterDelete: async (user) => afterAccountDeletion(user),
    },
  },
  hooks: { before: guardAccountRoutes, after: recordVisitEvents },
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
        // The verification link (Better Auth 1.7 does not link Google to an unverified account).
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
      // Explicit, and shown in the banner: a visit to a customer's account ends on its own.
      impersonationSessionDuration: IMPERSONATION_SECONDS,
    }),
    leakedPasswordCheck({
      enabled: isLeakedPasswordCheckOn(environment.LEAKED_PASSWORD_CHECK, environment.NODE_ENV),
    }),
    tanstackStartCookies(),
  ],
});

export type Auth = typeof auth;
