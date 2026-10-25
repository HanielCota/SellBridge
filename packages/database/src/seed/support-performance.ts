import { SUPPORT_TOPICS } from "@sellbridge/shared/support-topics";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { storeConnections, ticketEvents, ticketMessages, tickets, user } from "../schema/index.ts";
import { ensureAccount } from "./accounts.ts";
import { createRandom, type Random } from "./random.ts";
import type { SupportAuthor } from "./support.ts";

/*
 * Two months of support history for the performance screen: four people (one still on
 * probation), tickets with situations, reopenings, a repeated complaint, low ratings and a few
 * late tickets right now. Its own random sequence, so the other seeds keep theirs.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HISTORY_DAYS = 60;
const TICKETS = 140;

interface SeedAgent {
  readonly name: string;
  readonly email: string;
  readonly role: "agent" | "supervisor";
  readonly joinedDaysAgo: number;
  /** Share of the tickets this person takes. */
  readonly weight: number;
  readonly firstReplyHours: number;
  readonly cameBackChance: number;
  readonly averageRating: number;
}

const AGENTS: readonly SeedAgent[] = [
  {
    name: "Ana Ribeiro",
    email: "ana.suporte@sellbridge.local",
    role: "supervisor",
    joinedDaysAgo: 230,
    weight: 0.34,
    firstReplyHours: 0.6,
    cameBackChance: 0.05,
    averageRating: 4.8,
  },
  {
    name: "Bruno Teixeira",
    email: "bruno.suporte@sellbridge.local",
    role: "agent",
    joinedDaysAgo: 140,
    weight: 0.3,
    firstReplyHours: 0.9,
    cameBackChance: 0.1,
    averageRating: 4.5,
  },
  {
    name: "Diego Martins",
    email: "diego.suporte@sellbridge.local",
    role: "agent",
    joinedDaysAgo: 80,
    weight: 0.21,
    firstReplyHours: 1.1,
    cameBackChance: 0.08,
    averageRating: 4.6,
  },
  {
    name: "Camila Duarte",
    email: "camila.suporte@sellbridge.local",
    role: "agent",
    joinedDaysAgo: 22,
    weight: 0.15,
    firstReplyHours: 1.7,
    cameBackChance: 0.25,
    averageRating: 3.8,
  },
];

const LOW_COMMENTS = [
  "Respondeu, mas o problema continuou.",
  "Precisei abrir de novo.",
  "Demorou para explicar o motivo.",
] as const;

/** Seller situations, the late order and the disconnected store (lately) the most common. */
function pickSituation(random: Random, daysAgo: number) {
  const topics = SUPPORT_TOPICS.seller.filter((topic) => topic.situations.length > 0);
  if (daysAgo < 14 && random.chance(0.25)) {
    return { category: "store" as const, situationId: "store-disconnected" };
  }
  if (random.chance(0.22)) {
    return { category: "order" as const, situationId: "order-late" };
  }
  const topic = random.pick(topics);
  return { category: topic.category, situationId: random.pick(topic.situations).id };
}

function pickAgent(
  random: Random,
  agents: readonly (SeedAgent & { userId: string })[],
  daysAgo: number,
) {
  const available = agents.filter((agent) => agent.joinedDaysAgo > daysAgo);
  const total = available.reduce((sum, agent) => sum + agent.weight, 0);
  let roll = random.next() * total;
  for (const agent of available) {
    roll -= agent.weight;
    if (roll <= 0) {
      return agent;
    }
  }
  return available.at(-1) ?? null;
}

/** Mostly inside support hours, with Monday mornings the busiest. */
function openedAt(random: Random, now: number): { at: Date; daysAgo: number } {
  const daysAgo = random.integerBetween(0, HISTORY_DAYS - 1);
  const day = new Date(now - daysAgo * DAY);
  day.setUTCHours(random.integerBetween(11, 21), random.integerBetween(0, 59), 0, 0);
  return { at: new Date(Math.min(day.getTime(), now - HOUR)), daysAgo };
}

async function insertEvent(
  database: Database,
  ticketId: string,
  actorId: string | null,
  values: {
    type: "status_changed" | "rated";
    fromValue: string | null;
    toValue: string;
    createdAt: Date;
  },
) {
  await database
    .insert(ticketEvents)
    .values({ ticketId, actorId, automatic: actorId === null, ...values });
}

async function addReply(
  database: Database,
  reply: { ticketId: string; authorId: string; createdAt: Date; fromSupport: boolean },
) {
  const { ticketId, authorId, createdAt, fromSupport } = reply;
  await database.insert(ticketMessages).values({
    ticketId,
    authorId,
    isAdmin: fromSupport,
    body: fromSupport
      ? "Verificamos e já resolvemos por aqui. Pode conferir?"
      : "Ainda não deu certo, voltou a acontecer.",
    createdAt,
  });
}

interface SeedCase {
  random: Random;
  author: SupportAuthor;
  /** The author's first connected store, so store complaints can repeat about the same one. */
  storeConnectionId: string | null;
  agent: SeedAgent & { userId: string };
  opened: Date;
  now: number;
}

/** The customer comes back two days later; the agent answers and closes again. */
async function reopenAndClose(
  database: Database,
  ticketId: string,
  input: SeedCase,
  closedAt: Date,
) {
  const { agent } = input;
  const reopenAt = new Date(closedAt.getTime() + 2 * DAY);
  const finalClose = new Date(reopenAt.getTime() + 6 * HOUR);
  await addReply(database, {
    ticketId,
    authorId: input.author.userId,
    createdAt: reopenAt,
    fromSupport: false,
  });
  await insertEvent(database, ticketId, input.author.userId, {
    type: "status_changed",
    fromValue: "closed",
    toValue: "open",
    createdAt: reopenAt,
  });
  await addReply(database, {
    ticketId,
    authorId: agent.userId,
    createdAt: new Date(reopenAt.getTime() + 3 * HOUR),
    fromSupport: true,
  });
  await insertEvent(database, ticketId, agent.userId, {
    type: "status_changed",
    fromValue: "answered",
    toValue: "closed",
    createdAt: finalClose,
  });
  return finalClose;
}

/** Half the customers rate; the agent's average sets the stars. */
async function rateCase(database: Database, ticketId: string, input: SeedCase, closedAt: Date) {
  const { random, agent } = input;
  if (!random.chance(0.5)) {
    return { rating: null, ratingComment: null, ratedAt: null };
  }
  const rating = Math.max(
    1,
    Math.min(5, Math.round(agent.averageRating + (random.next() - 0.5) * 2)),
  );
  const ratedAt = new Date(closedAt.getTime() + HOUR);
  await insertEvent(database, ticketId, input.author.userId, {
    type: "rated",
    fromValue: null,
    toValue: String(rating),
    createdAt: ratedAt,
  });
  return { rating, ratingComment: rating <= 3 ? random.pick(LOW_COMMENTS) : null, ratedAt };
}

/** A ticket the agent answered and closed; sometimes reopened and closed again, sometimes rated. */
async function seedResolvedCase(database: Database, ticketId: string, input: SeedCase) {
  const { random, agent, opened } = input;
  const replyAt = new Date(opened.getTime() + agent.firstReplyHours * HOUR * (0.5 + random.next()));
  const closedAt = new Date(replyAt.getTime() + random.integerBetween(1, 30) * HOUR);
  await addReply(database, {
    ticketId,
    authorId: agent.userId,
    createdAt: replyAt,
    fromSupport: true,
  });
  await insertEvent(database, ticketId, agent.userId, {
    type: "status_changed",
    fromValue: "answered",
    toValue: "closed",
    createdAt: closedAt,
  });
  const comesBack = random.chance(agent.cameBackChance) && closedAt.getTime() + 3 * DAY < input.now;
  const finalClose = comesBack
    ? await reopenAndClose(database, ticketId, input, closedAt)
    : closedAt;
  const rating = await rateCase(database, ticketId, input, finalClose);
  await database
    .update(tickets)
    .set({
      status: "closed",
      firstResponseAt: replyAt,
      closedAt: finalClose,
      awaitingSince: null,
      ...rating,
      updatedAt: finalClose,
    })
    .where(eq(tickets.id, ticketId));
}

async function seedCase(database: Database, input: SeedCase & { daysAgo: number }) {
  const situation = pickSituation(input.random, input.daysAgo);
  const [ticket] = await database
    .insert(tickets)
    .values({
      tenantId: input.author.tenantId,
      createdById: input.author.userId,
      subject: "Chamado de exemplo do histórico do suporte",
      ...situation,
      storeConnectionId: situation.category === "store" ? input.storeConnectionId : null,
      priority: situation.situationId === "store-disconnected" ? "high" : "normal",
      assigneeId: input.agent.userId,
      status: "open",
      awaitingSince: input.opened,
      createdAt: input.opened,
      updatedAt: input.opened,
    })
    .returning({ id: tickets.id });
  if (ticket === undefined) {
    throw new Error("Falha ao criar chamado do histórico do suporte");
  }
  await database.insert(ticketMessages).values({
    ticketId: ticket.id,
    authorId: input.author.userId,
    isAdmin: false,
    body: "Preciso de ajuda com este caso, por favor.",
    createdAt: input.opened,
  });
  // The last two days stay open: some of them already late.
  if (input.daysAgo >= 2) {
    await seedResolvedCase(database, ticket.id, input);
  }
}

async function ensureAgents(database: Database, password: string, now: number) {
  const agents: (SeedAgent & { userId: string })[] = [];
  for (const agent of AGENTS) {
    const account = await ensureAccount(database, {
      name: agent.name,
      email: agent.email,
      password,
      role: "user",
      organizationSlug: supportTeamSlug(agent.email),
    });
    await database
      .update(user)
      .set({ role: agent.role, createdAt: new Date(now - agent.joinedDaysAgo * DAY) })
      .where(eq(user.id, account.userId));
    agents.push({ ...agent, userId: account.userId });
  }
  return agents;
}

export const SUPPORT_TEAM_EMAILS: readonly string[] = AGENTS.map((agent) => agent.email);

/** Each seeded team member's own organization, named after the e-mail. */
export function supportTeamSlug(email: string): string {
  return email.split("@")[0] ?? email;
}

async function firstStoreByTenant(database: Database, tenantIds: readonly string[]) {
  const rows = await database
    .select({ tenantId: storeConnections.tenantId, id: storeConnections.id })
    .from(storeConnections)
    .where(inArray(storeConnections.tenantId, [...tenantIds]));
  const stores = new Map<string, string>();
  for (const row of rows) {
    if (!stores.has(row.tenantId)) {
      stores.set(row.tenantId, row.id);
    }
  }
  return stores;
}

/** Idempotent: skipped once any of the seeded team members has replied to a ticket. */
export async function seedSupportPerformance(
  database: Database,
  input: { authors: readonly SupportAuthor[]; password: string },
): Promise<number> {
  const now = Date.now();
  const agents = await ensureAgents(database, input.password, now);
  const [existing] = await database
    .select({ id: ticketMessages.id })
    .from(ticketMessages)
    .where(
      inArray(
        ticketMessages.authorId,
        agents.map((agent) => agent.userId),
      ),
    )
    .limit(1);
  if (existing !== undefined || input.authors.length === 0) {
    return 0;
  }
  const random = createRandom(20_261_024);
  const stores = await firstStoreByTenant(
    database,
    input.authors.map((author) => author.tenantId),
  );
  let created = 0;
  for (let index = 0; index < TICKETS; index += 1) {
    const { at, daysAgo } = openedAt(random, now);
    const agent = pickAgent(random, agents, daysAgo);
    if (agent === null) {
      continue;
    }
    const author = random.pick(input.authors);
    await seedCase(database, {
      random,
      author,
      storeConnectionId: stores.get(author.tenantId) ?? null,
      agent,
      opened: at,
      now,
      daysAgo,
    });
    created += 1;
  }
  return created;
}
