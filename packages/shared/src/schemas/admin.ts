import { z } from "zod";
import { cepSchema } from "../cep.ts";
import { emailSchema, nameSchema } from "./auth.ts";
import { withFallback } from "./fallback.ts";

export const CUSTOMER_ROLES = ["user", "admin"] as const;
export const customerRoleSchema = z.enum(CUSTOMER_ROLES);
export type CustomerRole = z.infer<typeof customerRoleSchema>;

export const CUSTOMER_ROLE_LABELS: Record<CustomerRole, string> = {
  user: "Revendedor",
  admin: "Administrador",
};

export const customersSearchSchema = z.object({
  query: withFallback(z.string().trim().max(100).optional(), undefined),
  page: withFallback(z.coerce.number().int().min(1).default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(5).max(50).default(20), 20),
});
export type CustomersSearch = z.infer<typeof customersSearchSchema>;

const customerIdField = { userId: z.string().trim().min(1) };

export const customerIdSchema = z.object(customerIdField);

export const updateCustomerProfileSchema = z.object({
  ...customerIdField,
  name: nameSchema,
  email: emailSchema,
});
export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileSchema>;

export const setCustomerRoleSchema = z.object({ ...customerIdField, role: customerRoleSchema });

export const setCustomerBanSchema = z.object({
  ...customerIdField,
  banned: z.boolean(),
  reason: z.string().trim().max(200).optional(),
});

export const updateCustomerRegionSchema = z.object({ ...customerIdField, cep: cepSchema });

export const disconnectCustomerStoreSchema = z.object({
  ...customerIdField,
  storeConnectionId: z.uuid(),
});
