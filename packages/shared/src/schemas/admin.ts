import { z } from "zod";
import { freeText, pageNumberSchema } from "./common.ts";
import { cepSchema } from "../domain/cep.ts";
import { emailSchema, nameSchema } from "./auth.ts";
import { optionalParameter, withFallback } from "./fallback.ts";

/** A reseller (`user`) or one of the SellBridge team roles (see staff-access.ts). */
export const CUSTOMER_ROLES = ["user", "agent", "supervisor", "admin"] as const;
export const customerRoleSchema = z.enum(CUSTOMER_ROLES);
export type CustomerRole = z.infer<typeof customerRoleSchema>;

export const CUSTOMER_ROLE_LABELS: Record<CustomerRole, string> = {
  user: "Revendedor",
  agent: "Atendente",
  supervisor: "Supervisor",
  admin: "Administrador",
};

/** What can go wrong with a customer, from the most to the least urgent. */
export const CUSTOMER_ISSUE_KINDS = [
  "store",
  "listings",
  "ticket",
  "onboarding",
  "cooling",
] as const;
export const customerIssueKindSchema = z.enum(CUSTOMER_ISSUE_KINDS);
export type CustomerIssueKind = z.infer<typeof customerIssueKindSchema>;

export const CUSTOMER_SORTS = ["health", "revenue", "name", "recent"] as const;
export const customerSortSchema = z.enum(CUSTOMER_SORTS);
export type CustomerSort = z.infer<typeof customerSortSchema>;

export const CUSTOMER_VIEWS = ["list", "issues", "journey"] as const;
export const customerViewSchema = z.enum(CUSTOMER_VIEWS);
export type CustomerView = z.infer<typeof customerViewSchema>;

/** Which slice of the shared issue queue is shown. */
export const ISSUE_QUEUES = ["open", "mine", "snoozed"] as const;
export const issueQueueSchema = z.enum(ISSUE_QUEUES);
export type IssueQueue = z.infer<typeof issueQueueSchema>;

/** How long an issue can be snoozed, in days. */
export const SNOOZE_DAYS = [1, 3, 7] as const;

export const customersSearchSchema = z.object({
  view: withFallback(customerViewSchema.default("list"), "list"),
  query: withFallback(freeText().trim().max(100).optional(), undefined),
  issue: optionalParameter(customerIssueKindSchema),
  sort: withFallback(customerSortSchema.default("health"), "health"),
  queue: withFallback(issueQueueSchema.default("open"), "open"),
  /** The customer whose quick view is open in the list. */
  open: optionalParameter(freeText().trim().min(1).max(100)),
  page: withFallback(pageNumberSchema.default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(5).max(50).default(20), 20),
});
export type CustomersSearch = z.infer<typeof customersSearchSchema>;

export const customerIssuesSearchSchema = z.object({
  query: withFallback(freeText().trim().max(100).optional(), undefined),
  issue: optionalParameter(customerIssueKindSchema),
  queue: withFallback(issueQueueSchema.default("open"), "open"),
});
export type CustomerIssuesSearch = z.infer<typeof customerIssuesSearchSchema>;

const customerIdField = { userId: freeText().trim().min(1) };

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
  reason: freeText().trim().max(200).optional(),
});

export const updateCustomerRegionSchema = z.object({ ...customerIdField, cep: cepSchema });

export const disconnectCustomerStoreSchema = z.object({
  ...customerIdField,
  storeConnectionId: z.uuid(),
});

export const assignCustomerIssueSchema = z.object({
  ...customerIdField,
  issue: customerIssueKindSchema,
  /** True takes the issue for the admin asking; false lets it go back to the team. */
  take: z.boolean(),
});

export const snoozeCustomerIssueSchema = z.object({
  ...customerIdField,
  issue: customerIssueKindSchema,
  /** Days to hide the issue from the queue, or null to bring it back now. */
  days: z
    .number()
    .int()
    .refine((days) => SNOOZE_DAYS.some((allowed) => allowed === days))
    .nullable(),
});
