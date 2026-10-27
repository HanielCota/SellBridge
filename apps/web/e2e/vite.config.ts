import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import { encodeMockAuthorizationCode } from "@sellbridge/marketplaces/testing";
import { isStoreNameTaken } from "@sellbridge/database/repositories";
import { oauthStates } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import base from "../vite.config.ts";
import { e2eDatabase } from "./database.ts";

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** Consent belongs to the test harness, outside the application route tree. */
function consentFixture(): Plugin {
  const database = e2eDatabase();
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ): Promise<void> {
    try {
      const url = new URL(request.url ?? "/", process.env.APP_URL);
      if (url.pathname !== "/__e2e/consent") {
        next();
        return;
      }
      const state = url.searchParams.get("state") ?? "";
      const redirectUri = url.searchParams.get("redirect_uri");
      const expected = new URL("/api/oauth/mercado_livre/callback", process.env.APP_URL).href;
      const record = await database.query.oauthStates.findFirst({
        where: eq(oauthStates.state, state),
      });
      if (redirectUri !== expected || record === undefined) {
        response.writeHead(400);
        response.end("Invalid test consent request");
        return;
      }
      const shopName = url.searchParams.get("shopName");
      let duplicate = false;
      if (shopName !== null) {
        duplicate = await isStoreNameTaken(database, { tenantId: record.tenantId, shopName });
        if (!duplicate) {
          const callback = new URL(redirectUri);
          callback.searchParams.set("state", state);
          callback.searchParams.set("code", encodeMockAuthorizationCode(shopName));
          response.writeHead(302, { location: callback.href });
          response.end();
          return;
        }
      }
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(
        `<!doctype html><html lang="pt-BR" data-hydrated><h1>Autorizar o SellBridge</h1><p>Test fixture</p><form method="get"><input type="hidden" name="state" value="${escape(state)}"><input type="hidden" name="redirect_uri" value="${escape(redirectUri)}"><label>Nome da loja<input name="shopName" required></label><button>Autorizar acesso</button></form>${duplicate ? `<p>O nome &quot;${escape(shopName ?? "")}&quot; não está disponível</p>` : ""}</html>`,
      );
    } catch (error) {
      next(error);
    }
  }
  return {
    name: "sellbridge-e2e-consent",
    configureServer(server) {
      server.httpServer?.once("close", () => void database.$client.end());
      server.middlewares.use((request, response, next) => {
        void handle(request, response, next);
      });
    },
  };
}

export default defineConfig(({ command }) => {
  if (command !== "serve" || process.env.NODE_ENV === "production") {
    throw new Error("The E2E Vite configuration cannot build or serve production.");
  }
  return mergeConfig(base, {
    resolve: {
      alias: {
        "@/lib/server/marketplaces": fileURLToPath(
          new URL("./marketplaces.server.ts", import.meta.url),
        ),
      },
    },
    plugins: [consentFixture()],
  });
});
