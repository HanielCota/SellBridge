import { schema } from "@sellbridge/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { database } from "./database.ts";
import { environment } from "./environment.ts";
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

export const auth = betterAuth({
  baseURL: environment.BETTER_AUTH_URL,
  secret: environment.BETTER_AUTH_SECRET,
  database: drizzleAdapter(database, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
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
