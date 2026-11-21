import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requestSigningCodeSchema, signContractSchema } from "@sellbridge/shared/contract-signing";
import { z } from "zod";
import { accountMiddleware, staffMiddleware } from "@/lib/server/middleware";
import {
  loadContractSigningSettings,
  saveContractSigningSettings,
} from "./contract-signing-settings.server";
import { requestSigningCode, signContract } from "./contract-signing.server";

/** E-mails the code that confirms the signature of the tab's profile. */
export const requestContractCodeFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .validator(requestSigningCodeSchema)
  .handler(
    async ({ context, data }) =>
      await requestSigningCode(
        { userId: context.userId, tenantId: context.tenantId, kind: context.profileKind },
        data,
      ),
  );

/** Signs the contract of the tab's profile with the code from the e-mail. */
export const signContractFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .validator(signContractSchema)
  .handler(
    async ({ context, data }) =>
      await signContract(
        { userId: context.userId, tenantId: context.tenantId, kind: context.profileKind },
        data,
        { request: getRequest(), timeZone: data.timeZone },
      ),
  );

export const getContractSigningSettingsFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("settings.manage")])
  .handler(async () => await loadContractSigningSettings());

export const saveContractSigningSettingsFn = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("settings.manage")])
  .validator(z.object({ required: z.boolean() }))
  .handler(
    async ({ context, data }) =>
      await saveContractSigningSettings({ required: data.required, userId: context.userId }),
  );
