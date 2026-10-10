import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import {
  addTicketMessage,
  createTicket,
  getAttachment,
  getTicketThread,
  listAllTickets,
  listTenantTickets,
  setTicketStatus,
} from "./support.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let tenantA = "";
let tenantB = "";
let userIds: string[] = [];

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  users = await createTestUsers(database, 2);
  userIds = users.ids;
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("support tickets", () => {
  it("creates a ticket with attachment and keeps it inside the tenant", async () => {
    const [authorA] = userIds;
    if (!authorA) {
      throw new Error("usuário");
    }
    const { ticketId } = await createTicket(database, {
      tenantId: tenantA,
      userId: authorA,
      subject: "Pedido não chegou",
      body: "O pedido 123 não foi entregue ao comprador.",
      attachments: [
        { storageKey: "k/1.pdf", fileName: "1.pdf", mimeType: "application/pdf", sizeBytes: 10 },
      ],
    });
    const thread = await getTicketThread(database, ticketId, tenantA);
    expect(thread.ticket.status).toBe("open");
    expect(thread.messages).toHaveLength(1);
    const attachmentId = thread.messages[0]?.attachments[0]?.id ?? "";
    expect(attachmentId).not.toBe("");

    await expect(getTicketThread(database, ticketId, tenantB)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(getAttachment(database, attachmentId, tenantB)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await getAttachment(database, attachmentId, null)).fileName).toBe("1.pdf");
    expect((await listTenantTickets(database, tenantB, {}, { page: 1, pageSize: 10 })).total).toBe(
      0,
    );
    await expect(
      addTicketMessage(database, {
        ticketId,
        tenantId: tenantB,
        authorId: authorA,
        isAdmin: false,
        body: "tentativa de outro tenant",
        attachments: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("moves status between answered, open and closed", async () => {
    const [authorA, admin] = userIds;
    if (!authorA || !admin) {
      throw new Error("usuários");
    }
    const { ticketId } = await createTicket(database, {
      tenantId: tenantA,
      userId: authorA,
      subject: "Dúvida sobre repasse",
      body: "Quando recebo as comissões do fornecedor?",
      attachments: [],
    });
    await addTicketMessage(database, {
      ticketId,
      tenantId: null,
      authorId: admin,
      isAdmin: true,
      body: "Resposta do suporte.",
      attachments: [],
    });
    expect((await getTicketThread(database, ticketId, tenantA)).ticket.status).toBe("answered");

    await addTicketMessage(database, {
      ticketId,
      tenantId: tenantA,
      authorId: authorA,
      isAdmin: false,
      body: "Obrigado, mais uma dúvida.",
      attachments: [],
    });
    expect((await getTicketThread(database, ticketId, tenantA)).ticket.status).toBe("open");

    await setTicketStatus(database, ticketId, "closed");
    await expect(
      addTicketMessage(database, {
        ticketId,
        tenantId: null,
        authorId: admin,
        isAdmin: true,
        body: "Resposta tardia.",
        attachments: [],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const adminList = await listAllTickets(
      database,
      { search: "repasse" },
      { page: 1, pageSize: 10 },
    );
    expect(adminList.items.map((item) => item.id)).toContain(ticketId);
  });
});
