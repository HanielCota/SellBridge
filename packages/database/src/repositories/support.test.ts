import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { user } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import {
  addTicketMessage,
  assignTicket,
  autoCloseIdleTickets,
  closeTicketForCustomer,
  countUnreadSupportReplies,
  findTicketForMessage,
  getAttachment,
  getSupportMetrics,
  getTicketThread,
  listStaffTickets,
  listTenantTickets,
  markTicketRead,
  rateTicket,
  setTicketPriority,
  setTicketStatus,
} from "./support.ts";
import { createTicket } from "./support-create.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let tenantA = "";
let tenantB = "";
let reseller = "";
let agent = "";
let otherReseller = "";
let teammate = "";

/** createTestUsers names users by position; the agent is the second one. */
const AGENT_NAME = "Usuário 1";
const PAGE = { page: 1, pageSize: 50 } as const;
const HOUR = 3_600_000;
/** Fixed clocks far in the past, so the time-based queries only ever see these tickets. */
const T0 = new Date("2001-03-05T12:00:00Z");
/**
 * Marks this run's tickets: the team's queue spans every tenant, so on a busy database (seed,
 * e2e leftovers) the queue is searched for them instead of read from its first page.
 */
const RUN = randomUUID().slice(0, 8);

function at(hours: number): Date {
  return new Date(T0.getTime() + hours * HOUR);
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  users = await createTestUsers(database, 4);
  const [first, second, third, fourth] = users.ids;
  if (!first || !second || !third || !fourth) {
    throw new Error("usuários");
  }
  reseller = first;
  agent = second;
  otherReseller = third;
  teammate = fourth;
  await database
    .update(user)
    .set({ role: "agent" })
    .where(inArray(user.id, [agent, teammate]));
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

async function openTicket(subject: string, now = new Date()) {
  const { ticketId } = await createTicket(database, {
    tenantId: tenantA,
    userId: reseller,
    category: "order",
    subject: `${subject} · ${RUN}`,
    body: "Descrição do problema com detalhes suficientes.",
    attachments: [],
    now,
  });
  return ticketId;
}

async function reply(ticketId: string, now = new Date(), statusAfter?: "open" | "closed") {
  return addTicketMessage(database, {
    ticketId,
    tenantId: null,
    authorId: agent,
    kind: "reply",
    statusAfter,
    body: "Resposta do suporte.",
    attachments: [],
    now,
  });
}

async function staffQueue(queue: "unassigned" | "mine" | "overdue" | "all", now: Date) {
  const page = await listStaffTickets(database, { queue, viewerId: agent, now, search: RUN }, PAGE);
  return page.items.map((item) => item.id);
}

describe("support tickets", () => {
  it("creates a ticket with attachment and keeps it inside the tenant", async () => {
    const { ticketId } = await createTicket(database, {
      tenantId: tenantA,
      userId: reseller,
      category: "order",
      subject: "Pedido não chegou",
      body: "O pedido 123 não foi entregue ao comprador.",
      attachments: [
        { storageKey: "k/1.pdf", fileName: "1.pdf", mimeType: "application/pdf", sizeBytes: 10 },
      ],
    });
    const thread = await getTicketThread(database, ticketId, tenantA);
    expect(thread.ticket.status).toBe("open");
    expect(thread.ticket.category).toBe("order");
    expect(thread.ticket.priority).toBe("normal");
    expect(thread.ticket.awaitingSince).not.toBeNull();
    expect(thread.messages).toHaveLength(1);
    expect(thread.events).toEqual([]);
    const attachmentId = thread.messages[0]?.attachments[0]?.id ?? "";
    expect(attachmentId).not.toBe("");

    await expect(getTicketThread(database, ticketId, tenantB)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(getAttachment(database, attachmentId, tenantB)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await getAttachment(database, attachmentId, null)).fileName).toBe("1.pdf");
    expect((await listTenantTickets(database, tenantB, {}, PAGE)).total).toBe(0);
    await expect(
      addTicketMessage(database, {
        ticketId,
        tenantId: tenantB,
        authorId: reseller,
        kind: "reseller",
        body: "tentativa de outro tenant",
        attachments: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      markTicketRead(database, {
        ticketId,
        userId: otherReseller,
        tenantId: tenantB,
        lastMessageId: thread.messages[0]?.id ?? "",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      closeTicketForCustomer(database, { ticketId, tenantId: tenantB, userId: otherReseller }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("delivers the reseller's message to both sides with each author's photo", async () => {
    const photo = `/api/avatars/${reseller}.webp`;
    await database.update(user).set({ image: photo }).where(eq(user.id, reseller));
    try {
      const ticketId = await openTicket("Foto no chamado");
      await reply(ticketId);

      const resellerThread = await getTicketThread(database, ticketId, tenantA);
      const staffThread = await getTicketThread(database, ticketId, null);
      for (const thread of [resellerThread, staffThread]) {
        expect(
          thread.messages.map(({ body, isAdmin, authorImage }) => ({ body, isAdmin, authorImage })),
        ).toEqual([
          {
            body: "Descrição do problema com detalhes suficientes.",
            isAdmin: false,
            authorImage: photo,
          },
          { body: "Resposta do suporte.", isAdmin: true, authorImage: null },
        ]);
      }
    } finally {
      await database.update(user).set({ image: null }).where(eq(user.id, reseller));
    }
  });

  it("moves status between answered, open and closed and keeps the history", async () => {
    const ticketId = await openTicket("Dúvida sobre repasse");
    await reply(ticketId);
    expect((await getTicketThread(database, ticketId, tenantA)).ticket.status).toBe("answered");

    await addTicketMessage(database, {
      ticketId,
      tenantId: tenantA,
      authorId: reseller,
      kind: "reseller",
      body: "Obrigado, mais uma dúvida.",
      attachments: [],
    });
    expect((await getTicketThread(database, ticketId, tenantA)).ticket.status).toBe("open");

    await setTicketStatus(database, { ticketId, status: "closed", actorId: agent });
    await expect(reply(ticketId)).rejects.toMatchObject({ code: "CONFLICT" });

    const thread = await getTicketThread(database, ticketId, null);
    expect(thread.ticket.closedAt).not.toBeNull();
    expect(thread.events.map((event) => [event.type, event.toValue])).toEqual([
      ["status_changed", "answered"],
      ["assigned", AGENT_NAME],
      ["status_changed", "open"],
      ["status_changed", "closed"],
    ]);

    const search = await listStaffTickets(
      database,
      { queue: "all", search: `repasse · ${RUN}`, viewerId: agent },
      PAGE,
    );
    expect(search.items.map((item) => item.id)).toContain(ticketId);
  });

  it("keeps internal notes and their files away from the reseller", async () => {
    const ticketId = await openTicket("Estoque divergente");
    const note = await addTicketMessage(database, {
      ticketId,
      tenantId: null,
      authorId: agent,
      kind: "note",
      statusAfter: "closed",
      body: "Fornecedor confirmou falha na integração.",
      attachments: [
        { storageKey: "k/n.png", fileName: "n.png", mimeType: "image/png", sizeBytes: 5 },
      ],
    });
    expect(note.status).toBe("open");

    const adminThread = await getTicketThread(database, ticketId, null);
    expect(adminThread.messages.map((message) => message.isInternal)).toEqual([false, true]);
    expect(adminThread.ticket.createdById).toBe(reseller);
    expect(adminThread.ticket.assigneeId).toBeNull();
    const noteFile = adminThread.messages[1]?.attachments[0]?.id ?? "";
    expect((await getAttachment(database, noteFile, null)).fileName).toBe("n.png");

    const resellerThread = await getTicketThread(database, ticketId, tenantA);
    expect(resellerThread.messages).toHaveLength(1);
    expect(resellerThread.ticket.status).toBe("open");
    await expect(getAttachment(database, noteFile, tenantA)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("sends a reply with the status support chose", async () => {
    const ticketId = await openTicket("Troca de CNPJ");
    const sent = await reply(ticketId, new Date(), "closed");
    expect(sent.status).toBe("closed");
    expect((await getTicketThread(database, ticketId, tenantA)).ticket.status).toBe("closed");

    const lateNote = await addTicketMessage(database, {
      ticketId,
      tenantId: null,
      authorId: agent,
      kind: "note",
      body: "Registro: alteração feita no cadastro.",
      attachments: [],
    });
    expect(lateNote.status).toBe("closed");
  });
});

describe("support queues and response deadlines", () => {
  it("moves a ticket from the queue to whoever answers, and flags it while overdue", async () => {
    const ticketId = await openTicket("Prazo de resposta", at(0));

    expect(await staffQueue("unassigned", at(1))).toContain(ticketId);
    expect(await staffQueue("overdue", at(23))).not.toContain(ticketId);
    expect(await staffQueue("overdue", at(25))).toContain(ticketId);

    await setTicketPriority(database, { ticketId, priority: "urgent", actorId: agent, now: at(1) });
    expect(await staffQueue("overdue", at(3))).toContain(ticketId);

    await reply(ticketId, at(4));
    const thread = await getTicketThread(database, ticketId, null);
    expect(thread.ticket.assigneeId).toBe(agent);
    expect(thread.ticket.awaitingSince).toBeNull();
    expect(thread.ticket.firstResponseAt).toEqual(at(4));
    expect(await staffQueue("overdue", at(30))).not.toContain(ticketId);
    expect(await staffQueue("unassigned", at(5))).not.toContain(ticketId);
    expect(await staffQueue("mine", at(5))).toContain(ticketId);

    await addTicketMessage(database, {
      ticketId,
      tenantId: tenantA,
      authorId: reseller,
      kind: "reseller",
      body: "Ainda preciso de ajuda.",
      attachments: [],
      now: at(10),
    });
    expect((await getTicketThread(database, ticketId, null)).ticket.awaitingSince).toEqual(at(10));
    expect(await staffQueue("overdue", at(13))).toContain(ticketId);
  });

  it("lists the most overdue ticket first, by deadline rather than by how long it waited", async () => {
    const low = await openTicket("Baixa esperando muito", at(100));
    await setTicketPriority(database, {
      ticketId: low,
      priority: "low",
      actorId: agent,
      now: at(100),
    });
    const urgent = await openTicket("Urgente atrasado", at(140));
    await setTicketPriority(database, {
      ticketId: urgent,
      priority: "urgent",
      actorId: agent,
      now: at(140),
    });
    // At 150h the low one waited 50h but is 2h late (48h target); the urgent one waited 10h
    // and is 8h late (2h target).
    const queue = await staffQueue("overdue", at(150));
    expect(queue).toContain(urgent);
    expect(queue.indexOf(urgent)).toBeLessThan(queue.indexOf(low));
  });

  it("finds a ticket by words the customer wrote past the subject's excerpt", async () => {
    const code = `rastreio-${RUN}-zz`;
    const { ticketId } = await createTicket(database, {
      tenantId: tenantA,
      userId: reseller,
      category: "order",
      subject: "O pedido atrasou: Comprei faz 10 dias e o pedido ainda não chegou",
      body: `Comprei faz 10 dias e o pedido ainda não chegou, o rastreio parou. Código ${code}.`,
      attachments: [],
    });
    const page = await listStaffTickets(
      database,
      { queue: "all", viewerId: agent, now: new Date(), search: code },
      PAGE,
    );
    expect(page.items.map((item) => item.id)).toEqual([ticketId]);
  });

  it("only hands tickets to the support team", async () => {
    const ticketId = await openTicket("Atribuição");
    const self = { ticketId, actorId: agent, mayAssignOthers: false };
    await expect(
      assignTicket(database, { ...self, assigneeId: otherReseller, mayAssignOthers: true }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await assignTicket(database, { ...self, assigneeId: agent });
    await assignTicket(database, { ...self, assigneeId: null });
    const thread = await getTicketThread(database, ticketId, null);
    expect(thread.ticket.assigneeId).toBeNull();
    expect(thread.events.map((event) => [event.fromValue, event.toValue])).toEqual([
      [null, AGENT_NAME],
      [AGENT_NAME, null],
    ]);
    expect(thread.events.map((event) => event.isSelfAssignment)).toEqual([true, false]);
  });

  it("keeps an agent from taking a teammate's ticket, checked on the locked row", async () => {
    const ticketId = await openTicket("Chamado de colega");
    await assignTicket(database, {
      ticketId,
      assigneeId: teammate,
      actorId: teammate,
      mayAssignOthers: false,
    });
    const takeOver = { ticketId, assigneeId: agent, actorId: agent, mayAssignOthers: false };
    await expect(assignTicket(database, takeOver)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assignTicket(database, { ...takeOver, assigneeId: null })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await assignTicket(database, { ...takeOver, mayAssignOthers: true });
    expect((await getTicketThread(database, ticketId, null)).ticket.assigneeId).toBe(agent);
  });

  it("sends tickets of someone who left the team back to the queue", async () => {
    const ticketId = await openTicket("Responsável saiu da equipe");
    await assignTicket(database, {
      ticketId,
      assigneeId: teammate,
      actorId: teammate,
      mayAssignOthers: false,
    });
    expect(await staffQueue("unassigned", new Date())).not.toContain(ticketId);

    await database.update(user).set({ role: "user" }).where(eq(user.id, teammate));
    try {
      expect(await staffQueue("unassigned", new Date())).toContain(ticketId);
      // The screens show it unassigned too, so an agent gets "Assumir chamado" instead of a
      // former member's name inside the "Sem responsável" queue.
      const thread = await getTicketThread(database, ticketId, null);
      expect(thread.ticket).toMatchObject({ assigneeId: null, assigneeName: null });
      const queue = await listStaffTickets(
        database,
        { queue: "unassigned", viewerId: agent, now: new Date(), search: RUN },
        PAGE,
      );
      expect(queue.items.find((item) => item.id === ticketId)).toMatchObject({
        assigneeId: null,
        assigneeName: null,
      });
      await assignTicket(database, {
        ticketId,
        assigneeId: agent,
        actorId: agent,
        mayAssignOthers: false,
      });
      expect((await getTicketThread(database, ticketId, null)).ticket.assigneeId).toBe(agent);
    } finally {
      await database.update(user).set({ role: "agent" }).where(eq(user.id, teammate));
    }
  });
});

describe("unread replies", () => {
  it("shows each side what the other wrote since their last visit", async () => {
    // Searched for by its own subject: on a busy database a reply pushed this ticket off the
    // first page of the team's queue (regression, 2026-10-16).
    const subject = `Leitura de respostas ${randomUUID()}`;
    const ticketId = await openTicket(subject);
    const unreadFor = async (side: "customer" | "staff") => {
      if (side === "customer") {
        const page = await listTenantTickets(
          database,
          tenantA,
          { readerId: reseller, search: subject },
          PAGE,
        );
        return page.items.find((item) => item.id === ticketId)?.hasUnread;
      }
      const page = await listStaffTickets(
        database,
        { queue: "all", viewerId: agent, search: subject },
        PAGE,
      );
      return page.items.find((item) => item.id === ticketId)?.hasUnread;
    };

    expect(await unreadFor("staff")).toBe(true);
    expect(await unreadFor("customer")).toBe(false);

    const before = await countUnreadSupportReplies(database, tenantA, reseller);
    await reply(ticketId);
    expect(await unreadFor("customer")).toBe(true);
    expect(await unreadFor("staff")).toBe(false);
    expect(await countUnreadSupportReplies(database, tenantA, reseller)).toBe(before + 1);

    const shown = await getTicketThread(database, ticketId, tenantA);
    await markTicketRead(database, {
      ticketId,
      userId: reseller,
      tenantId: tenantA,
      lastMessageId: shown.messages.at(-1)?.id ?? "",
    });
    expect(await unreadFor("customer")).toBe(false);
    expect(await countUnreadSupportReplies(database, tenantA, reseller)).toBe(before);
  });

  it("reads only up to the message that was on screen", async () => {
    const ticketId = await openTicket("Resposta chega durante a leitura", at(500));
    await reply(ticketId, at(501));
    const shown = await getTicketThread(database, ticketId, tenantA);
    // A second reply lands between loading the thread and marking it read.
    await reply(ticketId, at(502));
    await markTicketRead(database, {
      ticketId,
      userId: reseller,
      tenantId: tenantA,
      lastMessageId: shown.messages.at(-1)?.id ?? "",
    });
    const page = await listTenantTickets(database, tenantA, { readerId: reseller }, PAGE);
    expect(page.items.find((item) => item.id === ticketId)?.hasUnread).toBe(true);
  });

  it("does not let a reseller point the read marker at an internal note", async () => {
    const ticketId = await openTicket("Marcador em nota interna");
    await addTicketMessage(database, {
      ticketId,
      tenantId: null,
      authorId: agent,
      kind: "note",
      body: "Só para a equipe.",
      attachments: [],
    });
    const staffThread = await getTicketThread(database, ticketId, null);
    await expect(
      markTicketRead(database, {
        ticketId,
        userId: reseller,
        tenantId: tenantA,
        lastMessageId: staffThread.messages.at(-1)?.id ?? "",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not count internal notes as a reply to the reseller", async () => {
    const ticketId = await openTicket("Nota não notifica");
    await addTicketMessage(database, {
      ticketId,
      tenantId: null,
      authorId: agent,
      kind: "note",
      body: "Só para a equipe.",
      attachments: [],
    });
    const page = await listTenantTickets(database, tenantA, { readerId: reseller }, PAGE);
    expect(page.items.find((item) => item.id === ticketId)?.hasUnread).toBe(false);
  });
});

describe("closing and rating", () => {
  it("lets the reseller close and rate once, and a new message reopens without the rating", async () => {
    const ticketId = await openTicket("Avaliação");
    await expect(
      rateTicket(database, { ticketId, tenantId: tenantA, userId: reseller, rating: 5 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await closeTicketForCustomer(database, { ticketId, tenantId: tenantA, userId: reseller });
    await expect(
      closeTicketForCustomer(database, { ticketId, tenantId: tenantA, userId: reseller }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await rateTicket(database, {
      ticketId,
      tenantId: tenantA,
      userId: reseller,
      rating: 4,
      comment: "  Resolveram rápido.  ",
    });
    let thread = await getTicketThread(database, ticketId, tenantA);
    expect(thread.ticket.rating).toBe(4);
    expect(thread.ticket.ratingComment).toBe("Resolveram rápido.");
    await expect(
      rateTicket(database, { ticketId, tenantId: tenantA, userId: reseller, rating: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await addTicketMessage(database, {
      ticketId,
      tenantId: tenantA,
      authorId: reseller,
      kind: "reseller",
      body: "Voltou a acontecer.",
      attachments: [],
    });
    thread = await getTicketThread(database, ticketId, tenantA);
    expect(thread.ticket.status).toBe("open");
    expect(thread.ticket.rating).toBeNull();
    expect(thread.ticket.closedAt).toBeNull();
  });

  it("closes answered tickets the reseller left alone", async () => {
    const answered = await openTicket("Sem retorno do cliente", at(0));
    await reply(answered, at(1));
    const waiting = await openTicket("Ainda aguardando suporte", at(0));

    expect(await autoCloseIdleTickets(database, { before: at(1), now: at(200) })).toBe(0);
    expect(await autoCloseIdleTickets(database, { before: at(2), now: at(200) })).toBe(1);

    const closed = await getTicketThread(database, answered, null);
    expect(closed.ticket.status).toBe("closed");
    expect(closed.events.at(-1)).toMatchObject({
      type: "status_changed",
      automatic: true,
      actorName: null,
      toValue: "closed",
    });
    expect((await getTicketThread(database, waiting, null)).ticket.status).toBe("open");
  });
});

describe("support metrics", () => {
  it("keeps a rating in the metrics after the ticket is reopened", async () => {
    const ticketId = await openTicket("Nota que não pode sumir", at(2000));
    await reply(ticketId, at(2001));
    await closeTicketForCustomer(database, {
      ticketId,
      tenantId: tenantA,
      userId: reseller,
      now: at(2002),
    });
    await rateTicket(database, {
      ticketId,
      tenantId: tenantA,
      userId: reseller,
      rating: 1,
      now: at(2003),
    });
    const before = await getSupportMetrics(database, { since: at(1999), now: at(2004) });

    await setTicketStatus(database, { ticketId, status: "open", actorId: agent, now: at(2004) });
    await setTicketStatus(database, { ticketId, status: "closed", actorId: agent, now: at(2005) });

    const after = await getSupportMetrics(database, { since: at(1999), now: at(2006) });
    expect(after.ratings).toBe(before.ratings);
    expect(after.averageRating).toBe(before.averageRating);
    expect(after.byAgent.find((row) => row.agentId === agent)?.averageRating).not.toBeNull();
  });

  it("measures first replies against the target and lists the team", async () => {
    const onTime = await openTicket("Métrica no prazo", at(1000));
    await reply(onTime, at(1001));
    const late = await openTicket("Métrica atrasada", at(1000));
    await reply(late, at(1030));

    const metrics = await getSupportMetrics(database, { since: at(999), now: at(1031) });
    expect(metrics.opened).toBeGreaterThanOrEqual(2);
    expect(metrics.withinTargetRate).not.toBeNull();
    expect(metrics.averageFirstResponseMinutes).not.toBeNull();
    expect(metrics.byCategory.find((row) => row.category === "order")?.total).toBeGreaterThan(0);
    const agentRow = metrics.byAgent.find((row) => row.agentId === agent);
    expect(agentRow?.replies).toBeGreaterThanOrEqual(2);
  });
});

describe("reseller view of the thread", () => {
  it("shows who took the ticket but not the team's triage, and when support last read it", async () => {
    const { ticketId } = await createTicket(database, {
      tenantId: tenantA,
      userId: reseller,
      category: "payment",
      subject: "Repasse da semana",
      body: "As vendas de segunda não entraram no Financeiro.",
      attachments: [],
      now: at(0),
    });
    await setTicketPriority(database, { ticketId, priority: "high", actorId: agent, now: at(1) });
    await addTicketMessage(database, {
      ticketId,
      tenantId: null,
      authorId: agent,
      kind: "reply",
      body: "Os pedidos já foram confirmados e entram na próxima atualização.",
      attachments: [],
      now: at(2),
    });

    const forReseller = await getTicketThread(database, ticketId, tenantA);
    expect(forReseller.events.map((event) => event.type)).toEqual(["status_changed", "assigned"]);
    expect(forReseller.seenByOtherSideAt).toEqual(at(2));

    const forStaff = await getTicketThread(database, ticketId, null);
    expect(forStaff.events.map((event) => event.type)).toEqual([
      "priority_changed",
      "status_changed",
      "assigned",
    ]);
    expect(forStaff.seenByOtherSideAt).toBeNull();
  });
});

describe("findTicketForMessage", () => {
  it("finds the ticket for its organization and for the team, never for another one", async () => {
    const ticketId = await openTicket("Antes de anexar");
    await expect(findTicketForMessage(database, { ticketId, tenantId: tenantA })).resolves.toEqual({
      status: "open",
    });
    await expect(findTicketForMessage(database, { ticketId, tenantId: null })).resolves.toEqual({
      status: "open",
    });
    await expect(
      findTicketForMessage(database, { ticketId, tenantId: tenantB }),
    ).resolves.toBeNull();
    await expect(
      findTicketForMessage(database, {
        ticketId: "00000000-0000-4000-8000-000000000000",
        tenantId: tenantA,
      }),
    ).resolves.toBeNull();
  });
});
