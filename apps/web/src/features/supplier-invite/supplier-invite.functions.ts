import { createServerFn } from "@tanstack/react-start";
import { supplierTokenSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";
import { privateResponse } from "@/lib/server/private-response";
import { publicMiddleware, signedInMiddleware } from "@/lib/server/middleware";
import {
  acceptSupplierInvite,
  describeSupplierInvite,
  inviteFromOrderLink,
} from "./supplier-invite.server";

/** Malformed tokens still reach the reader, which calls them invalid instead of failing. */
const inviteInputSchema = z.object({ token: z.string().max(200) });

// POST: a GET would put the invite's token in the request URL (history, proxies, access logs).
export const getSupplierInviteFn = createServerFn({ method: "POST" })
  .middleware([publicMiddleware])
  .validator(inviteInputSchema)
  .handler(async ({ data }) => {
    privateResponse();
    return describeSupplierInvite(data.token);
  });

export const acceptSupplierInviteFn = createServerFn({ method: "POST" })
  .middleware([signedInMiddleware])
  .validator(inviteInputSchema)
  .handler(async ({ data }) => {
    privateResponse();
    return acceptSupplierInvite(data.token);
  });

/** "Criar meu acesso ao painel" on an order link: the invite of the supplier behind it. */
export const inviteFromOrderLinkFn = createServerFn({ method: "POST" })
  .middleware([publicMiddleware])
  .validator(z.object({ token: supplierTokenSchema }))
  .handler(async ({ data }) => {
    privateResponse();
    return inviteFromOrderLink(data.token);
  });
