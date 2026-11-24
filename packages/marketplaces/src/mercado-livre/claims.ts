import { z } from "zod";
import { marketplaceError } from "../errors.ts";
import type { StoreCredentials } from "../types.ts";
import { requestJson, type MercadoLivreConfig, type MercadoLivreContext } from "./client.ts";
import { externalIdSchema } from "./schemas.ts";

/**
 * Claims and returns, read as the official pages describe them ("Gerenciar reclamações",
 * 20/08/2026; "Gerenciar devoluções", 22/12/2025). Unknown enum values are kept as text: the
 * marketplace adds values, and a new one must not make a claim unreadable.
 */
const dateSchema = z.iso.datetime({ offset: true });
/** Read on its own (`dateOrNull`): an unreadable deadline must not hide the whole claim. */
const optionalDateSchema = z.string().nullable().optional();

const playerSchema = z.object({
  role: z.string(),
  type: z.string(),
  user_id: externalIdSchema,
});
const claimSchema = z.object({
  id: externalIdSchema,
  resource_id: externalIdSchema,
  status: z.string(),
  type: z.string(),
  stage: z.string(),
  resource: z.string(),
  reason_id: z.string().nullable().optional(),
  players: z.array(playerSchema),
  resolution: z
    .object({ reason: z.string().nullable().optional(), date_created: optionalDateSchema })
    .nullable()
    .optional(),
  date_created: dateSchema,
  last_updated: dateSchema,
  related_entities: z.array(z.string()).nullable().optional(),
});
const claimDetailSchema = z.object({
  due_date: optionalDateSchema,
  action_responsible: z.string().nullable().optional(),
  problem: z.string().nullable().optional(),
});
const returnSchema = z.object({
  status: z.string(),
  status_money: z.string().nullable().optional(),
  shipments: z
    .array(
      z.object({
        type: z.string(),
        tracking_number: z.string().nullable().optional(),
        destination: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});
const claimSearchSchema = z.object({
  paging: z.object({ total: z.number().int().nonnegative() }),
  data: z.array(z.object({ id: externalIdSchema })),
});
const shipmentOrdersSchema = z
  .array(z.object({ order_id: externalIdSchema, seller_id: externalIdSchema }))
  .nullable();

/** Longest text of the marketplace kept on a claim. */
const MAX_PROBLEM_LENGTH = 500;
/** Claims read per search page: the documented maximum. */
const SEARCH_PAGE_SIZE = 100;
/** The search refuses offset + limit at 10000 or more. */
const MAX_SEARCH_OFFSET = 9_900;

/** Where a claim's money is: held, back with the buyer or released to the seller. */
export type ClaimMoneyStatus = "retained" | "refunded" | "available";

export interface MarketplaceClaimReturn {
  status: string;
  moneyStatus: ClaimMoneyStatus | null;
  /** The parcel going back: its tracking and whether it goes to the seller or the marketplace. */
  trackingCode: string | null;
  destination: "seller" | "marketplace" | null;
}

/** A claim as the marketplace reports it now; `resource` says what `resourceId` names. */
export interface MarketplaceClaim {
  externalClaimId: string;
  status: "opened" | "closed";
  type: string;
  stage: string;
  resource: string;
  resourceId: string;
  reasonId: string | null;
  openedAt: Date;
  marketplaceUpdatedAt: Date;
  resolutionReason: string | null;
  closedAt: Date | null;
  problem: string | null;
  actionResponsible: "seller" | "buyer" | "mediator" | null;
  actionDueAt: Date | null;
  return: MarketplaceClaimReturn | null;
}

function claimContext(config: MercadoLivreConfig): MercadoLivreContext {
  return {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
}

function assertNumericId(value: string, label: string): void {
  if (!/^\d{1,20}$/.test(value)) {
    throw marketplaceError(`${label} inválido`, { retryable: false });
  }
}

function dateOrNull(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") {
    return null;
  }
  return trimmed.slice(0, MAX_PROBLEM_LENGTH);
}

function actionResponsibleOf(value: string | null | undefined) {
  if (value === "seller" || value === "buyer" || value === "mediator") {
    return value;
  }
  return null;
}

function moneyStatusOf(value: string | null | undefined): ClaimMoneyStatus | null {
  if (value === "retained" || value === "refunded" || value === "available") {
    return value;
  }
  return null;
}

function destinationOf(name: string | null | undefined): MarketplaceClaimReturn["destination"] {
  if (name === "seller_address") {
    return "seller";
  }
  if (name === "warehouse") {
    return "marketplace";
  }
  return null;
}

/** The parcel going back: `return` goes to the seller or the warehouse (`return_from_triage` is internal). */
function returnParcel(raw: z.infer<typeof returnSchema>) {
  const parcels = raw.shipments ?? [];
  const parcel = parcels.find((shipment) => shipment.type === "return") ?? parcels[0];
  if (parcel === undefined) {
    return { trackingCode: null, destination: null };
  }
  return {
    trackingCode: textOrNull(parcel.tracking_number),
    destination: destinationOf(parcel.destination?.name),
  };
}

async function readClaimReturn(
  context: MercadoLivreContext,
  store: StoreCredentials,
  claimId: string,
): Promise<MarketplaceClaimReturn> {
  const raw = await requestJson(context, {
    schema: returnSchema,
    path: `/post-purchase/v2/claims/${claimId}/returns`,
    init: { accessToken: store.accessToken },
  });
  return { status: raw.status, moneyStatus: moneyStatusOf(raw.status_money), ...returnParcel(raw) };
}

/** Throws unless the connected seller answers the claim: anyone else's claim is not ours to show. */
function assertSellerIsRespondent(claim: z.infer<typeof claimSchema>, store: StoreCredentials) {
  const respondent = claim.players.some(
    (player) => player.role === "respondent" && String(player.user_id) === store.externalShopId,
  );
  if (!respondent) {
    throw marketplaceError("Esta reclamação é de outra conta do Mercado Livre, não desta loja.", {
      retryable: false,
    });
  }
}

/**
 * Reads a claim with its detail (who must act, until when) and, when it has one, its return.
 *
 * @throws {AppError} When the claim does not name the connected seller as the respondent.
 */
export async function readMercadoLivreClaim(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  claimId: string,
): Promise<MarketplaceClaim> {
  assertNumericId(claimId, "Número da reclamação");
  const context = claimContext(config);
  const init = { accessToken: store.accessToken };
  const claim = await requestJson(context, {
    schema: claimSchema,
    path: `/post-purchase/v1/claims/${claimId}`,
    init,
  });
  assertSellerIsRespondent(claim, store);
  const detail = await requestJson(context, {
    schema: claimDetailSchema,
    path: `/post-purchase/v1/claims/${claimId}/detail`,
    init,
  });
  const hasReturn = (claim.related_entities ?? []).includes("return");
  return {
    externalClaimId: String(claim.id),
    status: claim.status === "closed" ? "closed" : "opened",
    type: claim.type,
    stage: claim.stage,
    resource: claim.resource,
    resourceId: String(claim.resource_id),
    reasonId: textOrNull(claim.reason_id),
    openedAt: new Date(claim.date_created),
    marketplaceUpdatedAt: new Date(claim.last_updated),
    resolutionReason: textOrNull(claim.resolution?.reason),
    closedAt: dateOrNull(claim.resolution?.date_created),
    problem: textOrNull(detail.problem),
    actionResponsible: actionResponsibleOf(detail.action_responsible),
    actionDueAt: dateOrNull(detail.due_date),
    return: hasReturn ? await readClaimReturn(context, store, claimId) : null,
  };
}

/** Which of the seller's claims to list: the ones still open, or the ones updated lately. */
export type ClaimSearchFilter = { status: "opened" } | { updatedAfter: Date };

function filterParameters(filter: ClaimSearchFilter): Record<string, string> {
  if ("status" in filter) {
    return { status: filter.status, sort: "date_created:asc" };
  }
  return {
    // The search wants milliseconds in the date ("Buscar reclamações").
    range: `last_updated:after:${filter.updatedAfter.toISOString().replace("Z", "+00:00")}`,
    sort: "last_updated:asc",
  };
}

/**
 * Ids of the store's claims as the seller (respondent), the filters the docs recommend, either
 * still open or updated after a date. Stops at the search's own offset ceiling.
 */
export async function searchMercadoLivreClaims(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  filter: ClaimSearchFilter,
): Promise<string[]> {
  assertNumericId(store.externalShopId, "Número da loja");
  const context = claimContext(config);
  const ids: string[] = [];
  for (let offset = 0; offset <= MAX_SEARCH_OFFSET; offset += SEARCH_PAGE_SIZE) {
    const query = new URLSearchParams({
      "players.user_id": store.externalShopId,
      "players.role": "respondent",
      ...filterParameters(filter),
      offset: String(offset),
      limit: String(SEARCH_PAGE_SIZE),
    });
    const page = await requestJson(context, {
      schema: claimSearchSchema,
      path: `/post-purchase/v1/claims/search?${query.toString()}`,
      init: { accessToken: store.accessToken },
    });
    ids.push(...page.data.map((claim) => String(claim.id)));
    if (page.data.length < SEARCH_PAGE_SIZE || offset + SEARCH_PAGE_SIZE >= page.paging.total) {
      break;
    }
  }
  return ids;
}

/**
 * The store's orders in one shipment (`GET /shipments/{id}/orders`, "Vendas associadas a um
 * envio"). A cart ships several orders together; orders of other sellers are dropped.
 */
export async function readMercadoLivreShipmentOrders(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  shipmentId: string,
): Promise<string[]> {
  assertNumericId(shipmentId, "Número do envio");
  const orders = await requestJson(claimContext(config), {
    schema: shipmentOrdersSchema,
    path: `/shipments/${shipmentId}/orders`,
    init: { accessToken: store.accessToken, headers: { "X-New-Domain": "true" } },
  });
  return (orders ?? [])
    .filter((order) => String(order.seller_id) === store.externalShopId)
    .map((order) => String(order.order_id));
}
