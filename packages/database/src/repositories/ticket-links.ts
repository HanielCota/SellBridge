import { notFoundError, validationError } from "@sellbridge/shared/errors";
import { and, asc, desc, eq, ne, notExists, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { matchesEveryWord } from "./sql/search-pattern.ts";
import {
  member,
  orders,
  storeConnections,
  ticketEvents,
  ticketFollowers,
  ticketOrders,
  tickets,
  user,
} from "../schema/index.ts";

/*
 * What hangs off a ticket besides the conversation: the orders it is about and the people of
 * the store who get the e-mails. Every write is scoped to the reseller's tenant.
 */

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type OrderStatus = (typeof orders.$inferSelect)["status"];
type Marketplace = (typeof storeConnections.$inferSelect)["marketplace"];

export interface LinkedOrder {
  orderId: string;
  externalOrderId: string;
  status: OrderStatus;
  totalCents: number;
  orderedAt: Date;
  buyerName: string | null;
  storeName: string;
  marketplace: Marketplace;
}

export interface TicketFollower {
  userId: string;
  name: string;
  email: string;
  /** Gets an e-mail when support answers. */
  notify: boolean;
  /** Opened the ticket: follows it without being added. */
  isRequester: boolean;
}

const orderColumns = {
  orderId: orders.id,
  externalOrderId: orders.externalOrderId,
  status: orders.status,
  totalCents: orders.totalCents,
  orderedAt: orders.orderedAt,
  buyerName: orders.buyerName,
  storeName: storeConnections.shopName,
  marketplace: storeConnections.marketplace,
};

/** Locks the reseller's ticket so links and their history land in a consistent order. */
async function lockTenantTicket(transaction: Transaction, ticketId: string, tenantId: string) {
  const [ticket] = await transaction
    .select({ id: tickets.id, createdById: tickets.createdById })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)))
    .limit(1)
    .for("update");
  if (!ticket) {
    throw notFoundError("Chamado não encontrado");
  }
  return ticket;
}

async function findTenantOrder(transaction: Transaction, orderId: string, tenantId: string) {
  const [order] = await transaction
    .select({ id: orders.id, externalOrderId: orders.externalOrderId })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);
  if (!order) {
    throw notFoundError("Pedido não encontrado");
  }
  return order;
}

export async function listTicketOrders(
  database: Database,
  ticketId: string,
): Promise<LinkedOrder[]> {
  return database
    .select(orderColumns)
    .from(ticketOrders)
    .innerJoin(orders, eq(orders.id, ticketOrders.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(eq(ticketOrders.ticketId, ticketId))
    .orderBy(asc(ticketOrders.createdAt));
}

/** The tenant's latest orders not linked to this ticket yet, optionally searched. */
export async function listLinkableOrders(
  database: Database,
  input: { tenantId: string; ticketId: string; search?: string | undefined; limit: number },
): Promise<LinkedOrder[]> {
  const alreadyLinked = database
    .select({ one: sql`1` })
    .from(ticketOrders)
    .where(and(eq(ticketOrders.ticketId, input.ticketId), eq(ticketOrders.orderId, orders.id)));
  return database
    .select(orderColumns)
    .from(orders)
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(
      and(
        eq(orders.tenantId, input.tenantId),
        notExists(alreadyLinked),
        input.search
          ? matchesEveryWord(input.search, [orders.externalOrderId, orders.buyerName])
          : undefined,
      ),
    )
    .orderBy(desc(orders.orderedAt))
    .limit(input.limit);
}

/** Pins an order of the same store to the ticket; linking it twice changes nothing. */
export async function linkTicketOrder(
  database: Database,
  input: { ticketId: string; tenantId: string; orderId: string; actorId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const ticket = await lockTenantTicket(transaction, input.ticketId, input.tenantId);
    const order = await findTenantOrder(transaction, input.orderId, input.tenantId);
    const inserted = await transaction
      .insert(ticketOrders)
      .values({ ticketId: ticket.id, orderId: order.id, linkedById: input.actorId, createdAt: now })
      .onConflictDoNothing()
      .returning({ orderId: ticketOrders.orderId });
    if (inserted.length === 0) {
      return;
    }
    await transaction.insert(ticketEvents).values({
      ticketId: ticket.id,
      actorId: input.actorId,
      type: "order_linked",
      fromValue: null,
      toValue: order.externalOrderId,
      createdAt: now,
    });
  });
}

export async function unlinkTicketOrder(
  database: Database,
  input: { ticketId: string; tenantId: string; orderId: string; actorId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const ticket = await lockTenantTicket(transaction, input.ticketId, input.tenantId);
    const order = await findTenantOrder(transaction, input.orderId, input.tenantId);
    const removed = await transaction
      .delete(ticketOrders)
      .where(and(eq(ticketOrders.ticketId, ticket.id), eq(ticketOrders.orderId, order.id)))
      .returning({ orderId: ticketOrders.orderId });
    if (removed.length === 0) {
      return;
    }
    await transaction.insert(ticketEvents).values({
      ticketId: ticket.id,
      actorId: input.actorId,
      type: "order_unlinked",
      fromValue: order.externalOrderId,
      toValue: null,
      createdAt: now,
    });
  });
}

/** The requester first, then the colleagues added to the ticket. */
export async function listTicketFollowers(
  database: Database,
  ticketId: string,
): Promise<TicketFollower[]> {
  const [requester] = await database
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      notify: sql<boolean>`coalesce(${ticketFollowers.notify}, true)`,
    })
    .from(tickets)
    .innerJoin(user, eq(user.id, tickets.createdById))
    .leftJoin(
      ticketFollowers,
      and(eq(ticketFollowers.ticketId, tickets.id), eq(ticketFollowers.userId, user.id)),
    )
    .where(eq(tickets.id, ticketId))
    .limit(1);
  if (!requester) {
    throw notFoundError("Chamado não encontrado");
  }
  const others = await database
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      notify: ticketFollowers.notify,
    })
    .from(ticketFollowers)
    .innerJoin(user, eq(user.id, ticketFollowers.userId))
    .where(
      and(eq(ticketFollowers.ticketId, ticketId), ne(ticketFollowers.userId, requester.userId)),
    )
    .orderBy(asc(ticketFollowers.createdAt));
  return [
    { ...requester, isRequester: true },
    ...others.map((follower) => ({ ...follower, isRequester: false })),
  ];
}

/**
 * Who to e-mail when support answers: every follower who did not turn it off and is still an
 * active member of the ticket's store. Leaving the store or being banned stops the e-mails.
 */
export async function findTicketEmailRecipients(
  database: Database,
  ticketId: string,
): Promise<{ name: string; email: string }[]> {
  const followers = await listTicketFollowers(database, ticketId);
  const activeMembers = await database
    .select({ userId: member.userId })
    .from(tickets)
    .innerJoin(member, eq(member.organizationId, tickets.tenantId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(tickets.id, ticketId), sql`coalesce(${user.banned}, false) = false`));
  const activeIds = new Set(activeMembers.map((row) => row.userId));
  return followers
    .filter((follower) => follower.notify && activeIds.has(follower.userId))
    .map(({ name, email }) => ({ name, email }));
}

/** Turns the support e-mails of this ticket on or off for one person of the store. */
export async function setTicketNotifications(
  database: Database,
  input: { ticketId: string; tenantId: string; userId: string; notify: boolean; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const ticket = await lockTenantTicket(transaction, input.ticketId, input.tenantId);
    await transaction
      .insert(ticketFollowers)
      .values({
        ticketId: ticket.id,
        userId: input.userId,
        notify: input.notify,
        addedById: input.userId,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [ticketFollowers.ticketId, ticketFollowers.userId],
        set: { notify: input.notify },
      });
  });
}

/** People of the store, to pick who else should follow a ticket. */
export async function listTenantColleagues(
  database: Database,
  tenantId: string,
): Promise<{ userId: string; name: string; email: string }[]> {
  return database
    .select({ userId: user.id, name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, tenantId))
    .orderBy(asc(user.name));
}

/** Adds a colleague of the same store to the ticket's e-mails (again, if they had muted it). */
export async function addTicketFollower(
  database: Database,
  input: { ticketId: string; tenantId: string; userId: string; actorId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const ticket = await lockTenantTicket(transaction, input.ticketId, input.tenantId);
    const [membership] = await transaction
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, input.tenantId), eq(member.userId, input.userId)))
      .limit(1);
    if (!membership) {
      throw validationError("Escolha alguém da sua equipe");
    }
    const [existing] = await transaction
      .select({ notify: ticketFollowers.notify })
      .from(ticketFollowers)
      .where(and(eq(ticketFollowers.ticketId, ticket.id), eq(ticketFollowers.userId, input.userId)))
      .limit(1);
    const alreadyFollows = existing ? existing.notify : ticket.createdById === input.userId;
    if (alreadyFollows) {
      return;
    }
    await transaction
      .insert(ticketFollowers)
      .values({
        ticketId: ticket.id,
        userId: input.userId,
        notify: true,
        addedById: input.actorId,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [ticketFollowers.ticketId, ticketFollowers.userId],
        set: { notify: true, addedById: input.actorId },
      });
    await transaction.insert(ticketEvents).values({
      ticketId: ticket.id,
      actorId: input.actorId,
      type: "follower_added",
      fromValue: null,
      toValue: input.userId,
      createdAt: now,
    });
  });
}
