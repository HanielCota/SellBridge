import { notFoundError } from "@sellbridge/shared/errors";
import type { ReturnClaimStatus } from "@sellbridge/shared/return-claims";
import type {
  CloseReason,
  ReturnDestination,
  ReturnReason,
  ReturnStep,
  SupplierVerdict,
} from "@sellbridge/shared/return-policy";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { orderShipments, returnClaimPhotos, returnClaims, suppliers } from "../schema/index.ts";

export interface ReturnPhotoView {
  id: string;
  side: "seller" | "supplier";
  fileName: string;
  mimeType: string;
}

/** Where a return stands under the policy, as both sides and the team read it. */
export interface ReturnPolicyDetails {
  step: ReturnStep;
  destination: ReturnDestination | null;
  reason: ReturnReason | null;
  reasonNote: string | null;
  returnShippingCents: number | null;
  reasonStatedAt: Date | null;
  arrivedAt: Date | null;
  forwardDueAt: Date | null;
  forwardedAt: Date | null;
  forwardTrackingCode: string | null;
  supplierReceivedAt: Date | null;
  marketplaceDueAt: Date | null;
  supplierDueAt: Date | null;
  supplierVerdict: SupplierVerdict | null;
  supplierCondition: string | null;
  supplierResellable: boolean | null;
  supplierAnsweredAt: Date | null;
  closeReason: CloseReason | null;
  closedAt: Date | null;
  supplierOwesShippingCents: number | null;
  stockReturnedAt: Date | null;
  photos: ReturnPhotoView[];
}

const POLICY_COLUMNS = {
  claimId: returnClaims.id,
  step: returnClaims.policyStep,
  destination: returnClaims.destination,
  reason: returnClaims.reason,
  reasonNote: returnClaims.reasonNote,
  returnShippingCents: returnClaims.returnShippingCents,
  reasonStatedAt: returnClaims.reasonStatedAt,
  arrivedAt: returnClaims.arrivedAt,
  forwardDueAt: returnClaims.forwardDueAt,
  forwardedAt: returnClaims.forwardedAt,
  forwardTrackingCode: returnClaims.forwardTrackingCode,
  supplierReceivedAt: returnClaims.supplierReceivedAt,
  marketplaceDueAt: returnClaims.marketplaceDueAt,
  supplierDueAt: returnClaims.supplierDueAt,
  supplierVerdict: returnClaims.supplierVerdict,
  supplierCondition: returnClaims.supplierCondition,
  supplierResellable: returnClaims.supplierResellable,
  supplierAnsweredAt: returnClaims.supplierAnsweredAt,
  closeReason: returnClaims.closeReason,
  closedAt: returnClaims.closedAt,
  supplierOwesShippingCents: returnClaims.supplierOwesShippingCents,
  stockReturnedAt: returnClaims.stockReturnedAt,
};

async function photosByClaim(
  executor: DatabaseExecutor,
  claimIds: readonly string[],
): Promise<Map<string, ReturnPhotoView[]>> {
  const byClaim = new Map<string, ReturnPhotoView[]>();
  if (claimIds.length === 0) {
    return byClaim;
  }
  const rows = await executor
    .select({
      claimId: returnClaimPhotos.claimId,
      id: returnClaimPhotos.id,
      side: returnClaimPhotos.side,
      fileName: returnClaimPhotos.fileName,
      mimeType: returnClaimPhotos.mimeType,
    })
    .from(returnClaimPhotos)
    .where(inArray(returnClaimPhotos.claimId, [...claimIds]))
    .orderBy(asc(returnClaimPhotos.createdAt));
  for (const { claimId, ...photo } of rows) {
    byClaim.set(claimId, [...(byClaim.get(claimId) ?? []), photo]);
  }
  return byClaim;
}

type PolicyRow = { claimId: string; step: ReturnStep | null } & Omit<
  ReturnPolicyDetails,
  "step" | "photos"
>;

function toDetails(row: PolicyRow, photos: ReturnPhotoView[]): ReturnPolicyDetails | null {
  const { claimId: _claimId, step, ...rest } = row;
  if (step === null) {
    return null;
  }
  return { ...rest, step, photos };
}

/** The policy side of one claim, or null for a claim the team decides alone. */
export async function findReturnPolicyDetails(
  executor: DatabaseExecutor,
  claimId: string,
): Promise<ReturnPolicyDetails | null> {
  const [row] = await executor
    .select(POLICY_COLUMNS)
    .from(returnClaims)
    .where(eq(returnClaims.id, claimId))
    .limit(1);
  if (row === undefined) {
    return null;
  }
  const photos = await photosByClaim(executor, [claimId]);
  return toDetails(row, photos.get(claimId) ?? []);
}

/** One supplier's return of an order, as the reseller works on it from the order page. */
export interface OrderReturnView {
  claimId: string;
  status: ReturnClaimStatus;
  supplierName: string;
  supplierCostCents: number;
  creditedCents: number | null;
  refusalReason: string | null;
  items: { title: string; quantity: number }[];
  policy: ReturnPolicyDetails;
}

/** The reseller's returns under the policy for one of its orders; older claims are left out. */
export async function listOrderReturns(
  database: Database,
  input: { tenantId: string; orderId: string },
): Promise<OrderReturnView[]> {
  const rows = await database
    .select({
      ...POLICY_COLUMNS,
      status: returnClaims.status,
      supplierName: suppliers.name,
      supplierCostCents: returnClaims.supplierCostCents,
      creditedCents: returnClaims.creditedCents,
      refusalReason: returnClaims.refusalReason,
      items: orderShipments.items,
    })
    .from(returnClaims)
    .innerJoin(suppliers, eq(suppliers.id, returnClaims.supplierId))
    .innerJoin(orderShipments, eq(orderShipments.id, returnClaims.shipmentId))
    .where(
      and(
        eq(returnClaims.sellerTenantId, input.tenantId),
        eq(returnClaims.orderId, input.orderId),
        isNotNull(returnClaims.policyStep),
      ),
    )
    .orderBy(asc(returnClaims.createdAt));
  const photos = await photosByClaim(
    database,
    rows.map((row) => row.claimId),
  );
  return rows.flatMap((row) => {
    const { status, supplierName, supplierCostCents, creditedCents, refusalReason, items } = row;
    const policy = toDetails(row, photos.get(row.claimId) ?? []);
    if (policy === null) {
      return [];
    }
    return [
      {
        claimId: row.claimId,
        status,
        supplierName,
        supplierCostCents,
        creditedCents,
        refusalReason,
        items: items.map((item) => ({ title: item.title, quantity: item.quantity })),
        policy,
      },
    ];
  });
}

export interface ReturnPhotoFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
}

/**
 * A return photo for download: the team reads any (`tenantId` null); a profile only those of a
 * return it is a side of. Anything else reads as missing.
 */
export async function findReturnPhoto(
  database: Database,
  input: { photoId: string; tenantId: string | null },
): Promise<ReturnPhotoFile> {
  const [row] = await database
    .select({
      storageKey: returnClaimPhotos.storageKey,
      fileName: returnClaimPhotos.fileName,
      mimeType: returnClaimPhotos.mimeType,
      sellerTenantId: returnClaims.sellerTenantId,
      supplierOrganizationId: suppliers.organizationId,
    })
    .from(returnClaimPhotos)
    .innerJoin(returnClaims, eq(returnClaims.id, returnClaimPhotos.claimId))
    .innerJoin(suppliers, eq(suppliers.id, returnClaims.supplierId))
    .where(eq(returnClaimPhotos.id, input.photoId))
    .limit(1);
  const allowed =
    row !== undefined &&
    (input.tenantId === null ||
      row.sellerTenantId === input.tenantId ||
      row.supplierOrganizationId === input.tenantId);
  if (!allowed) {
    throw notFoundError("Foto não encontrada");
  }
  return { storageKey: row.storageKey, fileName: row.fileName, mimeType: row.mimeType };
}
