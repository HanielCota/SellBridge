import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { forbiddenError } from "@sellbridge/shared/errors";
import { environment } from "@/lib/server/environment";

export function assertBillingOrigin(headers: Headers, applicationUrl: string) {
  if (headers.get("origin") !== new URL(applicationUrl).origin) {
    throw forbiddenError("Origem da solicitação de cobrança não autorizada");
  }
}

export const billingWriteMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    assertBillingOrigin(getRequestHeaders(), environment.APP_URL);
    return next();
  },
);
